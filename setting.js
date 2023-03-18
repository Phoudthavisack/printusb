const Printer = require("node-printer");

// const options = {
//   type: "usb",
//   vendorId: "0x0483",
//   productId: "0x5743",
// };

// const availablePrinters = Printer.list();
// console.log(availablePrinters);
// const printer = Printer(options);

// printer.execute('! U1 setvar "ip.addr" "192.168.1.200"\r\n', options, (err) => {
//   if (err) {
//     console.log(err);
//   } else {
//     console.log("IP address set to 192.168.1.200");
//   }
// });

const printer = require("node-printer");

// Get the list of available printers
const availablePrinters = printer.list();

// Connect to the first available printer
const myPrinter = availablePrinters[0];

// Print a test page
myPrinter.printDirect({data: "Hello, world!", type: "RAW"});