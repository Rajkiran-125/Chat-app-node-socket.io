let express = require('express');
let app = express();

let http = require('http');
let server = http.Server(app);

let socketIO = require('socket.io');
let io = socketIO(server);

let socketConnected = new Set();

let users = new Map(); // To track user statuses

const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
    res.send('<h1 style = "text-align: center;background: dodgerblue;"><marquee behavior="scroll" direction="left">Chat App Rajkiran Jaiswar<sup>®</sup> - v1.0.0.01</marquee></h1>');
});

app.use('/cron',require('./cron.js'));

io.on('connection', (socket) => {

    socket.on('join', (data) => {
        socket.join(data.room);
        socket.broadcast.to(data.room).emit('user joined');
    });

    // Listen for the user joining
    socket.on('user-joined', (data) => {
        // Add user to the map
        users.set(socket.id, data.username);
        io.emit('user-status-changed', { username: data.username, status: 'online' });
        console.log(`User ${data.username} is online`);
    });

    console.log('Socket Id',socket.id);

    socket.on('message', (data) => {
        io.in(data.room).emit('new message', {user: data.user, message: data.message, room: data.room, dateTime: data.dateTime}, console.log('Message: >>> ',data));
    });

    io.emit('clients-total', socketConnected.size);

    socket.on('disconnect', ()=>{
        const username = users.get(socket.id);
        if (username) {
            io.emit('user-status-changed', { username, status: 'offline' });
            console.log(`User ${username} is offline`);
        }
        users.delete(socket.id);
        
        console.log('Disconnected socket: ', socket.id);
        socketConnected.delete(socket.id);
        io.emit('clients-total', socketConnected.size);
    });

});

server.listen(port, () => {
    console.log(`started on port: ${port}`);
});
