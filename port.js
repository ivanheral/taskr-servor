const net = require('net');

module.exports = port => {
    port = parseInt(port);
    if (!isNaN(port) && (port < 1 || port > 65535)) {
        return `The port ${port} is out of range [1 - 65535]`;
    } else {
        return new Promise(resolve => {

            const tester = net
                .createServer()
                .once('error', _err => {
                    resolve('The port you have specified is already in use!');
                })
                .once('listening', () => tester.once('close', () => resolve("")).close())
                .listen(port);

        });
    }
};
