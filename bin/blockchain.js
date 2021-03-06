"use strict";

// built in modules
var assert = require("assert");
var fs = require("fs");

// external deps
var binary = require("binary");
var bitcore = require("bitcore");

var blockIdx = 0; // current block
var bytesRead = 0;
var skipBlocks = 0; // # of blocks to skip (sampling)

var closed = false;

module.exports = {
  close: function () {
    closed = true;
  },
  read: function (cb, sampleRate) {
    if (sampleRate === undefined) {
      sampleRate = 1; // default to 100% sample
    }
    closed = false;
    // read the blockchain
    fs.stat("bootstrap.dat", function (err, stats) {
      if (err) {
        throw err;
      }
      // start processing the file
      var totalFileSize = stats.size;
      var stream = fs.createReadStream("bootstrap.dat", {
        start: bytesRead // start at bytesRead to resume when client resets
      });
      var b = binary().loop(function (end, vars) {
        if (closed) {
          end();
          return;
        }
        this.word8lu("magic1").word8lu("magic2").word8lu("magic3").word8lu("magic4").word32lu("blockSizeWithHeader").buffer("message", "blockSizeWithHeader").tap(function (vars) {
          assert.equal(vars.magic1, 249);
          assert.equal(vars.magic2, 190);
          assert.equal(vars.magic3, 180);
          assert.equal(vars.magic4, 217);

          // message length is in vars.blockSizeWithHeader
          bytesRead += vars.blockSizeWithHeader + 8; // include header and magic bytes

          if (skipBlocks === 0 || sampleRate >= 1) {
            if (sampleRate < 1) {
              skipBlocks = Math.floor(Math.random() * (2 / sampleRate));
            }

            // parse out a block using bitcore
            var blockData = new Buffer(8 + vars.blockSizeWithHeader);
            blockData.writeUInt8(vars.magic1, 0);
            blockData.writeUInt8(vars.magic2, 1);
            blockData.writeUInt8(vars.magic3, 2);
            blockData.writeUInt8(vars.magic4, 3);
            blockData.writeUInt32LE(vars.blockSizeWithHeader, 4);
            vars.message.copy(blockData, 8);
            var block = bitcore.Block.fromBuffer(blockData);

            // update histogram bins
            cb(block, bytesRead, totalFileSize);
          } else if (sampleRate < 1) {
            skipBlocks--;
          }

          blockIdx++;
        });
      });
      stream.pipe(b);
    });
  }
};