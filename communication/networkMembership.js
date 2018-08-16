const fs = require('fs')

const utils = require('../utils')
var config = require('../config.js')

var messageString = require('./messageStrings.js');
var whisperUtils = require('./whisperUtils.js')

const { 
  WHISPER_TOPIC_NETWORKMEMBERSHIP, NETWORKMEMBERSHIP,
  WHISPER_REQUEST_EXISTINGRAFTMEMBERSHIP, WHISPER_REQUEST_NETWORKMEMBERSHIP,
  WHISPER_RESPONSE_NETWORKMEMBERSHIP_ACCEPTED, WHISPER_RESPONSE_EXISTINGRAFTMEMBERSHIP_ACCEPTED
} = require('../constants');

// TODO: Add to and from fields to validate origins
function requestExistingRaftNetworkMembership(result, cb) {

  console.log('[*] Requesting existing network membership. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedNetworkMembership = false
  let subscription = null

  function onData(msg) {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf('response|existingRaftNetworkMembership') >= 0) {
      receivedNetworkMembership = true
      if (subscription) {
        subscription.unsubscribe(function (err, res) {
          if (err) { console.log('requestExistingRaftNetworkMembership unsubscribe ERROR:', err) }
          subscription = null
        })
      }
      let messageTokens = message.split('|')
      console.log('[*] Network membership:', messageTokens[2])
      result.communicationNetwork.raftID = messageTokens[3]
      fs.writeFile('blockchain/raftID', result.communicationNetwork.raftID, function (err) {
        if (err) { console.log('requestExistingNetworkMembership write file ERROR:', err) }
        cb(null, result)
      })
    }
  }

  whisperUtils.addBootstrapSubscription(['NetworkMembership'], shh, onData,
    function (err, _subscription) {
      subscription = _subscription
    })

  let request = "request|existingRaftNetworkMembership";
  request += '|' + result.addressList[0]
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

// TODO: Add to and from fields to validate origins
function requestNetworkMembership(result, cb) {

  console.log('[*] Requesting network membership. This will block until the other node responds')

  let shh = result.communicationNetwork.web3WsRpc.shh;

  let receivedNetworkMembership = false
  let subscription = null

  function onData(msg) {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf('response|networkMembership') >= 0) {
      receivedNetworkMembership = true
      if (subscription) {
        subscription.unsubscribe(function (err, res) {
          if (err) { console.log('requestNetworkMembership unsubscribe ERROR:', err) }
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

  let request = "request|networkMembership";
  request += '|' + result.addressList[0]
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

function addToAddressList(result, address) {
  if (result.addressList) {
    result.addressList.push(address)
  } else {
    result.addressList = [address]
  }
}

function addToEnodeList(result, enode) {
  if (result.enodeList) {
    result.enodeList.push(enode)
  } else {
    result.enodeList = [enode]
  }
}

function allowAllNetworkMembershipRequests(result, msg, payload) {

  let shh = result.web3WsRpc.shh;
  let payloadTokens = payload.split('|')
  addToAddressList(result, payloadTokens[1])
  addToEnodeList(result, payloadTokens[2])
  let peerName = payloadTokens[3]
  console.log(peerName + ' has joined the network')

  let from = msg.from // TODO: This needs to be added into a DB.

  let responseString = WHISPER_RESPONSE_NETWORKMEMBERSHIP_ACCEPTED;
  whisperUtils.post(responseString, shh, WHISPER_TOPIC_NETWORKMEMBERSHIP, function (err, res) {
    if (err) { console.log('allowAllNetworkMembershipRequests ERROR:', err); }
  })
}

function networkMembershipRequestHandler(result, cb) {
  let request = WHISPER_REQUEST_NETWORKMEMBERSHIP

  let web3WsRpc = result.web3WsRpc;

  function onData(msg) {
    let message = null;
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload);
    }
    if (message && message.indexOf(request) >= 0) {
      if (result.networkMembership === NETWORKMEMBERSHIP.ALLOWALL) {
        allowAllNetworkMembershipRequests(result, msg, message.replace(request, ''))
      } else if (result.networkMembership === NETWORKMEMBERSHIP.PERMISSIONEDNODES) {
        // TODO
      } else if (result.networkMembership === NETWORKMEMBERSHIP.ALLOW_ONLY_PREAUTH) {
        // TODO
      }
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_NETWORKMEMBERSHIP], web3WsRpc.shh, onData)

  cb(null, result);
}

function existingRaftNetworkMembership(result, cb) {
  let request = WHISPER_REQUEST_EXISTINGRAFTMEMBERSHIP

  let commWeb3WsRpc = result.communicationNetwork.web3WsRpc
  let web3HttpRaft = result.web3HttpRaft

  function onData(msg) {
    let message = null
    if (msg && msg.payload) {
      message = utils.hex2a(msg.payload)
    }
    if (message && message.indexOf(request) >= 0) {
      if (result.networkMembership == NETWORKMEMBERSHIP.ALLOWALL) {
        let messageTokens = message.split('|')
        let peerName = messageTokens[4]
        let from = msg.from // TODO: This needs to be added into a DB.
        let peerEnode = messageTokens[3]
        web3HttpRaft.addPeer(peerEnode, function (err, raftID) {
          if (err) { console.log('addPeer ERROR:', err) }
          console.log(peerName + ' has joined the network with raftID: ' + raftID)
          let responseString = `${WHISPER_RESPONSE_EXISTINGRAFTMEMBERSHIP_ACCEPTED}|${raftID}`;
          whisperUtils.post(responseString, commWeb3WsRpc.shh, WHISPER_TOPIC_NETWORKMEMBERSHIP)
        })
      } else if (result.networkMembership == NETWORKMEMBERSHIP.ALLOW_ONLY_PREAUTH) {
        // TODO
      }
    }
  }

  whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_NETWORKMEMBERSHIP], commWeb3WsRpc.shh, onData)

  cb(null, result)
}

exports.RequestNetworkMembership = requestNetworkMembership
exports.requestExistingRaftNetworkMembership = requestExistingRaftNetworkMembership
exports.existingRaftNetworkMembership = existingRaftNetworkMembership
exports.networkMembershipRequestHandler = networkMembershipRequestHandler
