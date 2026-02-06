const path = require('path');
process.chdir(__dirname);
const cors = require("cors");
const express = require("express");

const app = express();
const { autoStart } = require('./menuPromp');

global.sessionsMap = new Map();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

autoStart(app)
