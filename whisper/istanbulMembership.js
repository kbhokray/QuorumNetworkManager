const utils = require('../utils')
var config = require('../config')

var whisperUtils = require('./utils.js')
let { REQUEST, RESPONSE } = require('./messageStrings');

const {
  WHISPER_TOPIC_NETWORKMEMBERSHIP, NETWORKMEMBERSHIP,
} = require('../constants');

let requestExistingIstanbulNetworkMembership = (result, cb) => {

  console.log('[*] Requesting existing network membership. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedNetworkMembership = false
  let subscription = null

  let onData = (msg) => {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(RESPONSE.EXISTINGISTANBULMEMBERSHIPACCEPTED) >= 0) {
      receivedNetworkMembership = true
      if (subscription) {
        subscription.unsubscribe((err, res) => {
          if (err) { console.log('requestExistingIstanbulNetworkMembership unsubscribe ERROR:', err) }
          subscription = null
        })
      }
      let messageTokens = message.split('|')
      console.log('[*] Network membership:', messageTokens[2])
      cb(null, result)
    }
  }

  whisperUtils.addBootstrapSubscription([NETWORKMEMBERSHIP], shh, onData,
    (err, _subscription) => {
      subscription = _subscription
    })

  let request = REQUEST.EXISTINGINSTANBULMEMBERSHIP;
  request += '|' + result.enodeList[0]
  request += '|' + config.identity.nodeName

  whisperUtils.postAtInterval(request, shh, NETWORKMEMBERSHIP, 5 * 1000, (err, intervalID) => {
    let checkNetworkMembership = setInterval(() => {
      if (receivedNetworkMembership) {
        clearInterval(intervalID)
        clearInterval(checkNetworkMembership)
      }
    }, 1000)
  })
}

let existingIstanbulNetworkMembership = (result, cb) => {
  let shh = result.communicationNetwork.web3WsRpc.shh
  let web3Ipc = result.web3Ipc

  let onData = (msg) => {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(REQUEST.EXISTINGINSTANBULMEMBERSHIP) >= 0) {
      if (result.networkMembership === NETWORKMEMBERSHIP.ALLOWALL) {
        let from = msg.from // TODO: This needs to be added into a DB.
        let messageTokens = message.split('|')
        let peerEnode = messageTokens[2]
        let peerName = messageTokens[3]
        web3Ipc.admin.addPeer(peerEnode, (err, raftID) => {
          if (err) { console.log('addPeer ERROR:', err) }
          console.log(peerName + ' has joined the network')
          let responseString = `${RESPONSE.EXISTINGISTANBULMEMBERSHIPACCEPTED}|`
          whisperUtils.post(responseString, shh, WHISPER_TOPIC_NETWORKMEMBERSHIP)
        })
      } else if (result.networkMembership === NETWORKMEMBERSHIP.PERMISSIONEDNODES) {
        // TODO
      } else if (result.networkMembership === NETWORKMEMBERSHIP.ALLOW_ONLY_PREAUTH) {
        // TODO
      }
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_NETWORKMEMBERSHIP], shh, onData)

  cb(null, result)
}

exports.existingIstanbulNetworkMembership = existingIstanbulNetworkMembership
exports.requestExistingIstanbulNetworkMembership = requestExistingIstanbulNetworkMembership
