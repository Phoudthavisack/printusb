const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const multer = require("multer");
var pjson = require("./package.json");
const uuid = require("uuid");
const fs = require("original-fs");
var path = require("path");
var ip = require("ip");
const cors = require("cors");
require("dotenv").config();
const app = express();
const server = http.createServer(app);
const escpos = require("escpos");
const sharp = require("sharp");
var async = require("async");
let allQueue = []; // que ທັງໝົດ
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function getAppDataPath() {
  switch (process.platform) {
    case "darwin": {
      return path.join(
        process.env.HOME,
        "Library",
        "appzap-desktop-restaurant"
      );
    }
    case "win32": {
      return path.join(process.env.APPDATA, "appzap-desktop-restaurant");
    }
    case "linux": {
      return path.join(process.env.HOME, "appzap-desktop-restaurant");
    }
    default: {
      console.error("Unsupported platform!");
      process.exit(1);
    }
  }
}
app.use((req, res, next) => {
  const appDatatDirPath = getAppDataPath();
  if (!fs.existsSync(appDatatDirPath)) {
    fs.mkdirSync(appDatatDirPath);
  }
  req.appDatatDirPath = appDatatDirPath;
  next();
});

var io = require("socket.io")(server, {
  serveClient: false,
  path: "/socket.io",
});

escpos.Network = require("escpos-network");
escpos.USB = require("escpos-usb");

var q = async.queue(async function (task, callback) {
  allQueue.push(task);
  JobRunner();
  callback();
}, 1);

// app.set("queue", q);
app.set("socketio", io);
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Headers",
    "Authorization, Origin, Content-Type, Accept"
  );
  next();
});

// Ethernet - printer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const appDataFilePath = path.join(req.appDatatDirPath, "./");
    cb(null, appDataFilePath);
  },
  filename: function (req, file, cb) {
    const _id = uuid.v4();
    req.queId = _id;
    cb(null, "." + _id + "." + file.mimetype.split("/")[1]);
    const data = {
      _id: _id,
      image: "." + _id + "." + file.mimetype.split("/")[1],
    };
  },
});

const upload = multer({ storage: storage });

// routes
app.get("/", async (req, res, next) => {
  try {
    return res.status(200).json({
      message: `Welcome to AppZap Thermal Printer`,
      version: pjson.version,
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

app.post("/ethernet/image", upload.single("image"), function (req, res, next) {
  try {
    // TODO: add ethernet image to que

    const _run = async (req) => {
      const imagePath = req.file.path;
      await resizeImage(imagePath, req.body.paper || 80);
      return new Promise((resolve, reject) => {
        const _ip = req.body.ip;
        const _port = parseInt(req.body.port);
        const device = new escpos.Network(_ip, _port);
        const options = { encoding: req.body.encoding || "GB18030" };
        const printer = new escpos.Printer(device, options);

        escpos.Image.load(
          imagePath,
          function (image) {
            device.open(function () {
              try {
                // printer.cut().close();
                printer
                  .beep(req.body.beep1 || 0, req.body.beep2 || 0) // .beep(1,9);
                  .align("ct")
                  .image(image, "d24")
                  .then(() => {
                    printer.cut().close();
                    fs.unlinkSync(imagePath, (err) => {
                      // console.log(`File not found ${imagePath}`);
                    });
                    resolve();
                  })
                  .catch((err) => {
                    console.error(err.message, "1679244200033");
                    reject(err);
                  });
              } catch (err) {
                printer.close();
                console.error(err.message, "1679244242472");
                reject(err);
              }
            });
            // printing.timeout = 10000;
          },
          (err) => {
            console.log(err.message, "1679244295659");
            reject(err);
          }
        );
      });
    };

    // TODO: add to que
    q.push({ _id: req.queId, _run: _run, _req: req }, function (err) {
      console.log(`Add queue ${req.queId}`);
    });
    return res.status(200).json({
      message: "Success!",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

app.post("/ethernet/text", async (req, res, next) => {
  try {
    const { config, text } = req.body;
    if (!config)
      return res.status(401).json({
        message: "Config is undefined!",
      });
    const device = new escpos.Network(config.ip, config.port);
    const options = { encoding: config.encoding || "GB18030" };
    const printer = new escpos.Printer(device, options);
    const printing = device.open(async function (error) {
      try {
        printer.beep(1, 9).encode("UTF-8").text(text).cut(true, 5);
      } catch {
        printer.close();
      }
    });
    printing.timeout = 10000;
    return res.status(200).json({
      message: "Success!",
    });
  } catch (err) {
    console.log(err);
    return res.status(500).json({
      message: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

app.post("/usb/image", upload.single("image"), function (req, res, next) {
  try {
    const _run = async (req) => {
      const imagePath = req.file.path;
      await resizeImage(imagePath, req.body.paper || 80);

      return new Promise((resolve, reject) => {
        try {
          const { config, beep1, beep2 } = req.body;
          const device = new escpos.USB();

          const options = config || { encoding: "GB18030" /* default */ };
          const printer = new escpos.Printer(device, options);
          // printer.close();
          escpos.Image.load(imagePath, function (image) {
            // 201 * 7 / 2.54
            device.open(
              function () {
                try {
                  printer
                    .beep(beep1 || 0, beep2 || 0) // .beep(1,9);
                    .align("ct")
                    .image(image, "d24")
                    .then(() => {
                      printer.cut().close();
                      fs.unlinkSync(imagePath, (err) => {
                        if (!err) {
                          // console.log(`File not found ${imagePath}`);
                        }
                      });
                      resolve();
                    })
                    .catch((err) => {
                      if (err) {
                        console.log(err.message, "1679239979985");
                        reject(err);
                      }
                    });
                } catch (err) {
                  console.log(err.message, "1679240017005");
                }
              },
              (err, device) => {
                console.error(err.message, "1679240021790");
                reject(err);
              }
            );
          });
        } catch (err) {
          console.error(err.message, "1679240026937");
          reject(err);
        }
      });
    };

    // TODO: add to que
    q.push({ _id: req.queId, _run: _run, _req: req }, function (err) {
      console.log(`Add queue ${req.queId}`);
    });

    return res.status(200).json({
      message: "Success!",
    });
  } catch (err) {
    console.error(err.message, "1679241988064");
    return res.status(500).json({
      message: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

app.post("/usb/text", async (req, res, next) => {
  try {
    const { config, text, beep1, beep2 } = req.body;

    const device = new escpos.USB();

    const options = config || { encoding: "GB18030" /* default */ };
    const printer = new escpos.Printer(device, options);
    const printing = device.open(async function (error) {
      // device.write('! U1 setvar "wifi.ssid" "your-ssid"\r\n');
      // device.write('! U1 setvar "wifi.ssid"ຫກດ "your-ssid"\r\n');
      try {
        printer
          .beep(beep1 || 0, beep2 || 0)
          .encode("UTF-8")
          .text(text)
          .cut(true, 5)
          .close();
      } catch {
        printer.close();
      }
    });
    printing.timeout = 10000;
    return res.status(200).json({
      message: "Success!",
    });
  } catch (err) {
    // console.log(err);
    return res.status(500).json({
      message: "Internal Server Error",
      code: "INTERNAL_SERVER_ERROR",
    });
  }
});

io.on("connection", (socket) => {
  console.log("CONNECT SUCCESS");
  socket.on("STATUS_PRINTING", (data) => {
    if (data) {
      console.log("STATUS_PRINTING", data);
      setTimeout(() => {
        socket.emit("STATUS_PRINTING", `fuck u ${data}`);
      }, 3000);
    }
  });
  socket.on("disconnect", (reason) => {
    console.log("DISCONNECT");
  });
});

// ---------------------------------------------------------------------------------------------- //
// que
let working = [];
let isWorking = false;
// DONE: Query managment
const JobRunner = async () => {
  try {
    if (isWorking || working?.length > 0) {
      return;
    }
    // Add allQueue to working
    if (working.length == 0 && allQueue.length > 0) {
      working = [...allQueue];
      allQueue = [];
    }

    if (working.length > 0 && !isWorking) {
      // Working
      isWorking = true;
      // console.log("runnnnning", working.length);
      let success = []; // que ທີເຮັດວຽກສຳເລັດ
      console.time();
      for (let que of working) {
        let timer;
        let _error = false;
        await que
          ._run(que._req)
          .then((data) => {
            console.log("Success", que._id);
            success.push(que);
            // clearTimeout(timer);
            // timer = delay(5000);
          })
          .catch((err) => {
            if (err) {
              _error = true;
              console.error(err.message, "1679240043630");
            }
          });
        if (_error) {
          allQueue.push(que); //add to que again
          await delay(5000);
        } else {
          await delay(1200);
        }
      }
      console.timeEnd();
      working = [];
      // allQueue = allQueue.filter((e) => {
      //   const _find = success.find((v) => v._id == e._id);
      //   if (!_find) {
      //     return true;
      //   } else {
      //     return false;
      //   }
      // });
      if (allQueue.length > 0) {
        isWorking = false;
        return JobRunner();
      } else {
        isWorking = false;
      }
    }

    return;
  } catch (err) {
    console.error(err.message, "1679241803577");
  }
};

// Function
async function resizeImage(imagePath, paperRoll = 80) {
  const image = new sharp(imagePath); // path to the stored image
  const imageAfterResize = await image
    .metadata() // get image metadata for size
    .then(function (metadata) {
      if ((paperRoll = 80)) {
        return image.resize({ width: 576 }).toBuffer(); // resize if too big
      } else if ((paperRoll = 58)) {
        return image.resize({ width: 384 }).toBuffer(); // resize if too big
      } else {
        return image.toBuffer();
      }
    });
  function writeToFile(data, fileName) {
    return new Promise((resolve, reject) => {
      try {
        fs.writeFileSync(fileName, data);
        resolve("Data written to file successfully.");
      } catch (error) {
        reject(error);
      }
    });
  }
  await writeToFile(imageAfterResize, imagePath);
}

// -----------
const port = process.env.PORT || 9150;
server.listen(port, () => {
  console.clear();
  console.log(`AppZap Thermal Printer - version ${pjson.version}`);
  console.log(`API 1: http://localhost:${port}`);
  console.log(`API 2: http://${ip.address()}:${port}`);
  console.log(`--------------------------------------------------`);
  console.log(`#Event -->`);
});

exports.closeServer = () => {
  server.close((err) => {
    console.log("server closed");
    process.exit(err ? 1 : 0);
  });
};
