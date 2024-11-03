let express = require('express');
let app = express();

let http = require('http');
let server = http.Server(app);

let socketIO = require('socket.io');
let io = socketIO(server);

let socketConnected = new Set();

const port = process.env.PORT || 3000;

io.on('connection', (socket) => {
    socket.on('join', (data) => {
        socket.join(data.room);
        socket.broadcast.to(data.room).emit('user joined');
    });

    console.log('Socket Id',socket.id);

    socket.on('message', (data) => {
        io.in(data.room).emit('new message', {user: data.user, message: data.message}, console.log('Message: >>> ',data.message));
    });

    io.emit('clients-total', socketConnected.size);

    socket.on('disconnect', ()=>{
        console.log('Disconnected socket: ', socket.id);
        socketConnected.delete(socket.id);
        io.emit('clients-total', socketConnected.size);
    });

});

server.listen(port, () => {
    console.log(`started on port: ${port}`);
});
