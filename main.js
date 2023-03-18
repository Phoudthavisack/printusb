const { app, BrowserWindow } = require("electron");
const express = require("./express");
const url = require("url");
const path = require("path");
const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    icon: './icon.png',
  });

  //   win.loadFile("index.html");
  win.loadURL("https://restaurant.appzap.la/");
};
app.whenReady().then(() => {
  createWindow();
});

app.on("window-all-closed", () => {
  express();
  if (process.platform !== "darwin") app.quit();
});
