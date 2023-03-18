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
var async = require("async");
let allQueue = [];
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// var q = queue({ results: [] });
function getAppDataPath() {
  switch (process.platform) {
    case "darwin": {
      return path.join(
        process.env.HOME,
        "Library",
        "Application",
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
      console.log("Unsupported platform!");
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
  JubRunner(task);
  // const data = await new Promise((resolve, reject) =>
  //   setTimeout(resolve, 5000)
  // );
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
    // const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    // console.log("uniqueSuffix", uniqueSuffix);
    const _id = uuid.v4();
    req.queId = _id;
    cb(null, "." + _id + "." + file.mimetype.split("/")[1]);
    const data = {
      _id: _id,
      image: "." + _id + "." + file.mimetype.split("/")[1],
    };

    // q.push({ _id: _id }, function (err) {
    //   console.log(`Add queue ${_id}`);
    // });
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
    const _ip = req.body.ip;
    console.log("_ip", _ip);
    const _port = parseInt(req.body.port);
    const imagePath = req.file.path;
    // const appDataFilePath = path.join(req.appDatatDirPath, imagePath);
    const device = new escpos.Network(_ip, _port);
    const options = { encoding: req.body.encoding || "GB18030" };
    const printer = new escpos.Printer(device, options);
    console.log("appDataFilePath", imagePath);
    escpos.Image.load(imagePath, function (image) {
      const checkTimeOut = setTimeout(() => {
        console.log("print agrain");
      }, 10000);
      const printing = device.open(function () {
        try {
          printer
            .beep(req.body.beep1 || 0, req.body.beep2 || 0) // .beep(1,9);
            .align("ct")
            .image(image, "d24")
            .then(() => {
              printer.cut().close();
              fs.unlinkSync(imagePath, (err) => {
                console.log(`File not found ${imagePath}`);
              });
              clearTimeout(checkTimeOut);
            });
        } catch (err) {
          console.log(err);
        }
      });
      printing.timeout = 10000;
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
        printer.beep(1, 9).encode("UTF-8").text(text).cut(true, 5).close();
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
      // const appDataFilePath = path.join(req.appDatatDirPath, imagePath);

      return new Promise((resolve, reject) => {
        try {
          const { config, beep1, beep2 } = req.body;
          const _port = parseInt(req.body.port);
          console.log("imagePath=w", imagePath);
          const allDeviceUSB = escpos.USB.findPrinter();
          // if (allDeviceUSB.length == 0) {
          //   resolve();
          // }
          const device = new escpos.USB();
          console.log("device");
          const options = config || { encoding: "GB18030" /* default */ };
          console.log("options");
          const printer = new escpos.Printer(device, options);
          console.log("printer");
          console.log("imagePath===>", imagePath);
          escpos.Image.load(imagePath, function (image) {
            console.log("image.length", image.length);
            console.log("escpos.Image.load");
            let checkTimeOut;
            checkTimeOut = setTimeout(() => {
              console.log("print agrain");
              resolve();
            }, 10000);
            console.log("checkTimeOut");

            device.open(
              function () {
                device.on("data", async (buffer) => {
                  await delay(buffer.length * 0.05);
                  resolve();
                  // device.close();
                });
                try {
                  console.log("device.open");
                  printer
                    .beep(beep1 || 0, beep2 || 0) // .beep(1,9);
                    .align("ct")
                    .image(image, "d24")
                    .then(() => {
                      printer.cut().close();
                      // printer.close();
                      console.log("first");
                      fs.unlinkSync(imagePath, (err) => {
                        if (!err) {
                          console.log(`File not found ${imagePath}`);
                        }
                      });
                      clearTimeout(checkTimeOut);
                      console.log("clearTimeout");
                    });
                } catch (err) {
                  console.log(err);
                }
              },
              (err) => {
                console.log("device.open err");
              }
            );
          });
          // resolve();
        } catch (err) {
          console.log(err);
          fs.unlinkSync(imagePath, (err) => {
            if (!err) {
              console.log(`File not found ${imagePath}`);
            }
          });
          reject();
        }
      });
    };

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

app.post("/usb/text", async (req, res, next) => {
  try {
    const { config, text, beep1, beep2 } = req.body;

    const device = new escpos.USB();

    const options = config || { encoding: "GB18030" /* default */ };
    const printer = new escpos.Printer(device, options);
    const printing = device.open(async function (error) {
      // device.write('! U1 setvar "wifi.ssid" "your-ssid"\r\n');
      device.write('! U1 setvar "wifi.ssid"ຫກດ "your-ssid"\r\n');
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
    console.log(err);
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
// TODO: Query managment
const JubRunner = async (newQ) => {
  try {
    console.log("all queue ", allQueue.length);
    if (newQ) {
      // console.log("Okey. I see queue", newQ._id);
      // console.log("Your queue is ", allQueue.length);
    }
    // Add allQueue to working
    if (working.length == 0 && allQueue.length > 0) {
      working = [...allQueue];
    }

    if (working.length > 0 && !isWorking) {
      // Working
      isWorking = true;
      console.log("runnnnning", working.length);
      let success = [];
      console.time();
      for (let que of working) {
        let timer;
        // timer = setTimeout(() => {
        //   console.log("Success", que._id);
        // }, 10000);
        await que
          ._run(que._req)
          .then((data) => {
            console.log("--then");
            // clearTimeout(timer);
            // timer = delay(400);
          })
          .catch((err) => {
            if (err) {
              console.log(err);
            }
          });
        // timer = await delay(10000);
        success.push(que);
        console.log("_okey", working.length);
      }
      console.timeEnd();
      working = [];
      isWorking = false;
      allQueue = allQueue.filter((e) => {
        const _find = success.find((v) => v._id == e._id);
        if (!_find) {
          return true;
        } else {
          return false;
        }
      });
      // isWorking = false;
      if (allQueue.length > 0) {
        JubRunner();
      }
    }
  } catch (err) {
    console.log(err);
  }
};
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
