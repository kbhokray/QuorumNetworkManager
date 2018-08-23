const fs = require('fs')

const utils = require('../utils')
let config = require('../config')

let whisperUtils = require('./utils')
let messageString = require('./messageStrings')

const { WHISPER_TOPIC_NODEINFO, FILE_BLOCKCHAIN_NODEINFO } = require('../constants');

let publish = messageString.Publish

let networkNodesInfo = {}

let getPublicWhisperKey = async (shh, whisperId) => {
  shh.getPublicKey(whisperId, (err, publicKey) => {
    if (err) {
      console.log('ERROR in getPublicWhisperKey:', err)
      throw err
    }
    return publicKey
  })
}

// TODO: Add to and from fields to validate origins
let publishNodeInformation = (result, cb) => {

  let web3HttpRpc = result.web3HttpRpc;
  let shh = result.communicationNetwork.web3WsRpc.shh;

  var c = result.constellationConfigSetup
  let filePath = c.folderName + '/' + c.publicKeyFileName
  let constellationPublicKey = fs.readFileSync(filePath, 'utf8')
  let nodeInformationPostIntervalID = null
  let accountList = web3HttpRpc.eth.accounts

  whisperUtils.getAsymmetricKey(shh, async (err, id) => {

    let pubKey = await getPublicWhisperKey(shh, id)

    let nodeInfo = {
      whisperId: id,
      whisperPubKey: pubKey,
      nodePubKey: result.nodePubKey,
      ipAddress: result.localIpAddress,
      nodeName: config.identity.nodeName,
      address: accountList[0],
      constellationPublicKey
    }

    let message = messageString.buildDelimitedString(publish.nodeInfo, JSON.stringify(nodeInfo))
    whisperUtils.postAtInterval(message, shh, WHISPER_TOPIC_NODEINFO, 10 * 1000, (err, intervalID) => {
      if (err) { console.log('nodeInformation postAtInterval ERROR:', err) }
      nodeInformationPostIntervalID = intervalID
    });

    let onData = (msg) => {
      let message = null
      if (msg && msg.payload) {
        message = utils.hex2a(msg.payload)
      }
      if (message && message.includes(publish.nodeInfo)) {
        let messageTokens = message.split('|')
        let receivedInfo = JSON.parse(messageTokens[2])
        let nodePubKey = networkNodesInfo[receivedInfo.nodePubKey]
        if (nodePubKey === undefined) {
          networkNodesInfo[receivedInfo.nodePubKey] = receivedInfo
          fs.writeFile(FILE_BLOCKCHAIN_NODEINFO, JSON.stringify(networkNodesInfo), (err) => {
            if (err) { console.log('Writing networkNodesInfo ERROR:', err) }
          })
        } else {
          // This info is already present, no need to add to networkNodesInfo
        }
      }
    }

    whisperUtils.addBootstrapSubscription([WHISPER_TOPIC_NODEINFO], shh, onData)
    cb(null, result)
  });
}

exports.publishNodeInformation = publishNodeInformation
