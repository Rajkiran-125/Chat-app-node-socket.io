const cron = require('node-cron');
const axios = require('axios');
const express = require('express');
const router = express.Router();

cron.schedule('*/1 * * * *', async () => {
  try {
    const response = await axios.get('https://chat-app-node-socket-io-5m2o.onrender.com');
    console.log(`Health check response: ${response.status}`);
  } catch (error) {
    console.error(`Health check error: ${error.message}`);
  }
});

module.exports = router;