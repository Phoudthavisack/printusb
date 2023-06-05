const { app, BrowserWindow, dialog } = require("electron");
const { closeServer } = require("./express");

const { autoUpdater } = require("electron-updater");

let curWindow;

// flags
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: "./icon.png",
  });

  //   win.loadFile("index.html");
  win.loadURL("https://restaurant.appzap.la/");
};
app.whenReady().then(() => {
  createWindow();

  autoUpdater.checkForUpdates();
});

// New update Available
autoUpdater.on("update-available", (info) => {
  let pth = autoUpdater.downloadUpdate();
  console.log("Updating...");
  console.log(pth);
});

autoUpdater.on("update-not-available", (info) => {
  // let pth = autoUpdater.downloadUpdate();
  dialog.showMessageBox(
    {
      type: "question",
      buttons: ["Update & Restart", "Cancel"],
      title: "Update Available",
      cancelId: 99,
      message:
        "New version ready to install. Would you like to update CoinWatch now?",
    },
    (response) => {
      console.log(`Exit: ${response}`); // eslint-disable-line no-console

      if (response === 0) {
        this.setQuitState(true);
        autoUpdater.quitAndInstall();
      }
    }
  );
});

// close
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
  closeServer();
});
