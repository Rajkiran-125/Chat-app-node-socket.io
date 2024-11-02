// const socket = io("http://localhost:4000", {})
const socket = io();

socket.on('clients-total', (data) =>{
    console.log('Data',data)
})