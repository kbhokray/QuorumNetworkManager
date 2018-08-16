let async = require('async')
let exec = require('child_process').exec
let prompt = require('prompt')
let fs = require('fs')

let whisper = require('../communication/whisperNetwork.js')
let utils = require('../utils')
let constellation = require('../constellation')
let peerHandler = require('../peerHandler')
let fundingHandler = require('../fundingHandler')
let ports = require('../config').ports
let setup = require('../config').setup
const { SCRIPT_BLOCKCHAIN_STARTRAFTNODE } = require('../constants')

prompt.start()

function startRaftNode(result, cb) {
  let options = { encoding: 'utf8', timeout: 100 * 1000 }
  let cmd = `./${SCRIPT_BLOCKCHAIN_STARTRAFTNODE}`
  cmd += ' ' + setup.targetGasLimit
  cmd += ' ' + ports.gethNode
  cmd += ' ' + ports.gethNodeRpc
  cmd += ' ' + ports.gethNodeWsRpc
  cmd += ' ' + ports.raftHttp
  if (result.networkMembership === 'permissionedNodes') {
    cmd += ' permissionedNodes'
  } else {
    cmd += ' allowAll'
  }
  cmd += ' ' + result.communicationNetwork.raftID
  let child = exec(cmd, options)
  child.stdout.on('data', function (data) {
    cb(null, result)
  })
  child.stderr.on('data', function (error) {
    console.log('ERROR:', error)
    cb(error, null)
  })
}

function handleExistingFiles(result, cb) {
  if (result.keepExistingFiles == false) {
    let seqFunction = async.seq(
      utils.clearDirectories,
      utils.createDirectories,
      utils.getNewGethAccount,
      utils.generateEnode,
      utils.displayEnode,
      constellation.createNewKeys,
      constellation.createConfig
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
  if (result.keepExistingFiles == false) {
    let seqFunction = async.seq(
      whisper.requestExistingRaftNetworkMembership,
      whisper.getGenesisBlockConfig,
      whisper.getStaticNodesFile
    )
    seqFunction(result, function (err, res) {
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    fs.readFile('blockchain/raftID', function (err, data) {
      result.communicationNetwork.raftID = data
      cb(null, result)
    })
  }
}

function joinRaftNetwork(config, cb) {
  console.log('[*] Starting new network...')

  let nodeConfig = {
    localIpAddress: config.localIpAddress,
    remoteIpAddress: config.remoteIpAddress,
    keepExistingFiles: config.keepExistingFiles,
    folders: ['blockchain', 'blockchain/geth', 'constellation'],
    constellationKeySetup: [
      { folderName: 'constellation', fileName: 'node' },
      { folderName: 'constellation', fileName: 'nodeArch' },
    ],
    constellationConfigSetup: {
      configName: 'constellation.config',
      folderName: 'constellation',
      localIpAddress: config.localIpAddress,
      localPort: ports.constellation,
      remoteIpAddress: config.remoteIpAddress,
      remotePort: ports.constellation,
      publicKeyFileName: 'node.pub',
      privateKeyFileName: 'node.key',
      publicArchKeyFileName: 'nodeArch.pub',
      privateArchKeyFileName: 'nodeArch.key',
    },
    "web3IpcHost": './blockchain/geth.ipc',
    "web3RpcProvider": 'http://localhost:' + ports.gethNodeRpc,
    "web3WsRpcProvider": 'ws://localhost:' + ports.gethNodeWsRpc,
    consensus: 'raft'
  }

  let seqFunction = async.seq(
    handleExistingFiles,
    whisper.joinCommunicationNetwork,
    handleNetworkConfiguration,
    startRaftNode,
    utils.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    whisper.addEnodeRequestHandler,
    fundingHandler.monitorAccountBalances,
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

function handleJoiningRaftNetwork(options, cb) {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.keepExistingFiles = options.keepExistingFiles
  getRemoteIpAddress(function (remoteIpAddress) {
    config.remoteIpAddress = remoteIpAddress
    joinRaftNetwork(config, function (err, result) {
      if (err) { return console.log('ERROR', err) }
      let networks = {
        raftNetwork: Object.assign({}, result),
        communicationNetwork: config.communicationNetwork
      }
      cb(err, networks)
    })
  })
}

exports.handleJoiningRaftNetwork = handleJoiningRaftNetwork
