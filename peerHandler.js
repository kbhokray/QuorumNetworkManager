let events = require('./eventEmitter');
const { EVENT_PEERHANDLER_NEWENODE } = require('./constants');

let enodeList = []

function listenForNewEnodes(result, cb) {
  let web3Ipc = result.web3Ipc
  events.on(EVENT_PEERHANDLER_NEWENODE, function (enode) {
    if (enodeList.indexOf(enode) < 0) {
      enodeList.push(enode)
      web3Ipc.admin.addPeer(enode, function (err, res) {
        if (err) { console.log('ERROR:', err) }
      })
    }
  })
  cb(null, result)
}

exports.listenForNewEnodes = listenForNewEnodes