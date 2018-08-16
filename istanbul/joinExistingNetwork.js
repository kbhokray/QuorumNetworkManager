let async = require('async')
let exec = require('child_process').exec
let prompt = require('prompt')
let fs = require('fs')

let whisper = require('../communication/whisperNetwork')
let util = require('../utils')
let constellation = require('../constellation')
let peerHandler = require('../peerHandler')
let fundingHandler = require('../fundingHandler')
let ports = require('../config').ports
let setup = require('../config').setup

const {
  FOLDER_BLOCKCHAIN, FOLDER_BLOCKCHAIN_GETH,
  FOLDER_CONSTELLATION, CONSTELLATION_FILE_PUBKEY,
  CONSTELLATION_FILE_PRIVKEY, CONSTELLATION_FILE_ARCHPUBKEY,
  CONSTELLATION_FILE_ARCHPRIVKEY, FILE_BLOCKCHAIN_GETHIPC,
  BLOCKCHAINPROVIDER_RPC_LOCALHOST, BLOCKCHAINPROVIDER_WS_LOCALHOST,
  CONSENSUS
} = require('../constants');

prompt.start()

function startIstanbulNode(result, cb) {
  console.log('[*] Starting istanbul node...')
  let options = { encoding: 'utf8', timeout: 100 * 1000 }
  let cmd = './startIstanbulNode.sh'
  cmd += ' ' + setup.targetGasLimit
  cmd += ' ' + ports.gethNode
  cmd += ' ' + ports.gethNodeRpc
  cmd += ' ' + ports.gethNodeWsRpc
  let child = exec(cmd, options)
  child.stdout.on('data', function (data) {
    cb(null, result)
  })
  child.stderr.on('data', function (error) {
    console.log('Start istanbul node ERROR:', error)
    cb(error, null)
  })
}

function handleExistingFiles(result, cb) {
  if (result.keepExistingFiles === false) {
    let seqFunction = async.seq(
      util.ClearDirectories,
      util.CreateDirectories,
      util.GetNewGethAccount,
      util.GenerateEnode,
      util.DisplayEnode,
      constellation.CreateNewKeys,
      constellation.CreateConfig
    )
    seqFunction(result, function (err, res) {
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

function handleNetworkConfiguration(result, cb) {
  if (result.keepExistingFiles === false) {
    let seqFunction = async.seq(
      whisper.requestExistingIstanbulNetworkMembership,
      whisper.GetGenesisBlockConfig,
      whisper.GetStaticNodesFile
    )
    seqFunction(result, function (err, res) {
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

function joinIstanbulNetwork(config, cb) {
  console.log('[*] Joining network...')

  let nodeConfig = {
    localIpAddress: config.localIpAddress,
    remoteIpAddress: config.remoteIpAddress,
    keepExistingFiles: config.keepExistingFiles,
    folders: [FOLDER_BLOCKCHAIN, FOLDER_BLOCKCHAIN_GETH, FOLDER_CONSTELLATION],
    constellationKeySetup: [
      { folderName: FOLDER_CONSTELLATION, fileName: 'node' },
      { folderName: FOLDER_CONSTELLATION, fileName: 'nodeArch' },
    ],
    constellationConfigSetup: {
      configName: 'constellation.config',
      folderName: FOLDER_CONSTELLATION,
      localIpAddress: config.localIpAddress,
      localPort: ports.constellation,
      remoteIpAddress: config.remoteIpAddress,
      remotePort: ports.constellation,
      publicKeyFileName: CONSTELLATION_FILE_PUBKEY,
      privateKeyFileName: CONSTELLATION_FILE_PRIVKEY,
      publicArchKeyFileName: CONSTELLATION_FILE_ARCHPUBKEY,
      privateArchKeyFileName: CONSTELLATION_FILE_ARCHPRIVKEY,
    },
    web3IpcHost: `./${FILE_BLOCKCHAIN_GETHIPC}`,
    web3RpcProvider: BLOCKCHAINPROVIDER_RPC_LOCALHOST + ports.gethNodeRpc,
    web3WsRpcProvider: BLOCKCHAINPROVIDER_WS_LOCALHOST + ports.gethNodeWsRpc,
    consensus: CONSENSUS.ISTANBUL
  }

  let seqFunction = async.seq(
    handleExistingFiles,
    whisper.joinCommunicationNetwork,
    handleNetworkConfiguration,
    startIstanbulNode,
    util.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    whisper.addEnodeRequestHandler,
    fundingHandler.monitorAccountBalances,
    whisper.existingIstanbulNetworkMembership,
    whisper.publishNodeInformation
  )

  seqFunction(nodeConfig, function (err, res) {
    if (err) { return console.log('ERROR', err) }
    console.log('[*] New network started')
    cb(err, res)
  })
}

function getRemoteIpAddress(cb) {
  if (setup.automatedSetup === true) {
    cb(setup.remoteIpAddress)
  } else {
    console.log('In order to join the network, please enter the ip address of the coordinating node')
    prompt.get(['ipAddress'], function (err, network) {
      cb(network.ipAddress)
    })
  }
}

function handleJoiningExistingIstanbulNetwork(options, cb) {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.keepExistingFiles = options.keepExistingFiles
  getRemoteIpAddress(function (remoteIpAddress) {
    config.remoteIpAddress = remoteIpAddress
    joinIstanbulNetwork(config, function (err, result) {
      if (err) { return console.log('ERROR', err) }
      let networks = {
        raftNetwork: Object.assign({}, result),
        communicationNetwork: config.communicationNetwork
      }
      cb(err, networks)
    })
  })
}

exports.handleJoiningExistingIstanbulNetwork = handleJoiningExistingIstanbulNetwork
