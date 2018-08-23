let events = require('../eventEmitter');
const { EVENT_PEERHANDLER_NEWENODE } = require('../constants');

let enodeList = []

let listenForNewEnodes = (result, cb) => {
  let web3Ipc = result.web3Ipc
  events.on(EVENT_PEERHANDLER_NEWENODE, (enode) => {
    if (enodeList.indexOf(enode) < 0) {
      enodeList.push(enode)
      web3Ipc.admin.addPeer(enode, (err, res) => {
        if (err) { console.log('ERROR:', err) }
      })
    }
  })
  cb(null, result)
}

exports.listenForNewEnodes = listenForNewEnodes