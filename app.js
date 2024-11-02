const express = require('express');
const app = express();
const port = process.env.PORT || 3000;
const path = require('path');

let socketConnected = new Set();

const server = app.listen(port, () => {
    console.log('server is running on port', port);
});

const io = require('socket.io')(server);

app.use(express.static((path.join(__dirname, 'public'))));

io.on('connection', onConnected);

function onConnected(socket){
    console.log('Socket Id: ', socket.id);
    socketConnected.add(socket.id);

    io.emit('clients-total', socketConnected.size);
    
    socket.on('disconnect', ()=>{
        console.log('Disconnected socket: ', socket.id);
        socketConnected.delete(socket.id);
        io.emit('clients-total', socketConnected.size);
    })
}