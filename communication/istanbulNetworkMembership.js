const utils = require('../utils')
var config = require('../config')

var whisperUtils = require('./whisperUtils.js')

const {
  WHISPER_REQUEST_EXISTINGISTANBULMEMBERSHIP,
  WHISPER_TOPIC_NETWORKMEMBERSHIP, NETWORKMEMBERSHIP,
  WHISPER_RESPONSE_EXISTINGISTANBULMEMBERSHIP_ACCEPTED
} = require('../constants');

function requestExistingIstanbulNetworkMembership(result, cb) {

  console.log('[*] Requesting existing network membership. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedNetworkMembership = false
  let subscription = null

  function onData(msg) {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf('response|existingIstanbulNetworkMembership') >= 0) {
      receivedNetworkMembership = true
      if (subscription) {
        subscription.unsubscribe(function (err, res) {
          if (err) { console.log('requestExistingIstanbulNetworkMembership unsubscribe ERROR:', err) }
          subscription = null
        })
      }
      let messageTokens = message.split('|')
      console.log('[*] Network membership:', messageTokens[2])
      cb(null, result)
    }
  }

  whisperUtils.addBootstrapSubscription(['NetworkMembership'], shh, onData,
    function (err, _subscription) {
      subscription = _subscription
    })

  let request = "request|existingIstanbulNetworkMembership";
  request += '|' + result.enodeList[0]
  request += '|' + config.identity.nodeName

  whisperUtils.postAtInterval(request, shh, 'NetworkMembership', 5 * 1000, function (err, intervalID) {
    let checkNetworkMembership = setInterval(function () {
      if (receivedNetworkMembership) {
        clearInterval(intervalID)
        clearInterval(checkNetworkMembership)
      }
    }, 1000)
  })
}

function existingIstanbulNetworkMembership(result, cb) {
  let request = WHISPER_REQUEST_EXISTINGISTANBULMEMBERSHIP

  let shh = result.communicationNetwork.web3WsRpc.shh
  let web3Ipc = result.web3Ipc

  function onData(msg) {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(request) >= 0) {
      if (result.networkMembership == NETWORKMEMBERSHIP.ALLOWALL) {
        let from = msg.from // TODO: This needs to be added into a DB.
        let messageTokens = message.split('|')
        let peerEnode = messageTokens[2]
        let peerName = messageTokens[3]
        web3Ipc.admin.addPeer(peerEnode, function (err, raftID) {
          if (err) { console.log('addPeer ERROR:', err) }
          console.log(peerName + ' has joined the network')
          let responseString = `${WHISPER_RESPONSE_EXISTINGISTANBULMEMBERSHIP_ACCEPTED}|`
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
