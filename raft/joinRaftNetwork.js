let async = require('async')
let exec = require('child_process').exec
let prompt = require('prompt')
let fs = require('fs')

let whisper = require('../communication/whisperNetwork')
let utils = require('../utils')
let constellation = require('../constellation')
let peerHandler = require('../peerHandler')
let fundingHandler = require('../fundingHandler')
let ports = require('../config').ports
let setup = require('../config').setup

const { 
  FOLDER_BLOCKCHAIN,
  FOLDER_BLOCKCHAIN_GETH,
  FOLDER_CONSTELLATION,
  CONSTELLATION_FILE_PUBKEY,
  CONSTELLATION_FILE_PRIVKEY,
  CONSTELLATION_FILE_ARCHPUBKEY,
  CONSTELLATION_FILE_ARCHPRIVKEY,
  FILE_BLOCKCHAIN_GETHIPC,
  BLOCKCHAINPROVIDER_RPC_LOCALHOST,
  BLOCKCHAINPROVIDER_WS_LOCALHOST,
  CONSENSUS
} = require('../constants');

prompt.start()

function displayGethAccount(result, cb) {
  console.log('Account:', result.addressList[0])
  cb(null, result)
}

function startRaftNode(result, cb) {
  let options = { encoding: 'utf8', timeout: 100 * 1000 }
  let cmd = './startRaftNode.sh'
  cmd += ' ' + ports.gethNode
  cmd += ' ' + ports.gethNodeRpc
  cmd += ' ' + ports.gethNodeWsRpc
  cmd += ' ' + ports.raftHttp
  if (result.networkMembership === 'permissionedNodes') {
    cmd += ' permissionedNodes'
  } else {
    cmd += ' allowAll'
  }
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
      utils.ClearDirectories,
      utils.CreateDirectories,
      utils.GetNewGethAccount,
      displayGethAccount,
      utils.GenerateEnode,
      utils.DisplayEnode,
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
  if (result.keepExistingFiles == false) {
    let seqFunction = async.seq(
      whisper.RequestNetworkMembership,
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

function joinRaftNetwork(config, cb) {
  console.log('[*] Starting new node...')

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
    consensus: CONSENSUS.RAFT
  }

  let seqFunction = async.seq(
    handleExistingFiles,
    whisper.JoinCommunicationNetwork,
    handleNetworkConfiguration,
    startRaftNode,
    utils.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    fundingHandler.monitorAccountBalances,
    whisper.publishNodeInformation
  )

  seqFunction(nodeConfig, function (err, res) {
    if (err) { return console.log('ERROR', err) }
    console.log('[*] New node started')
    cb(err, res)
  })
}

function handleJoiningRaftNetwork(options, cb) {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.keepExistingFiles = options.keepExistingFiles
  console.log('In order to join the network, '
    + 'please enter the ip address of the coordinating node')
  prompt.get(['ipAddress'], function (err, network) {
    config.remoteIpAddress = network.ipAddress
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
