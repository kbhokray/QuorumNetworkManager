let async = require('async')
let exec = require('child_process').exec
let prompt = require('prompt')
let fs = require('fs')

let whisper = require('../../whisper/whisper')
let utils = require('../../utils')
let constellation = require('../../constellation/constellation')
let peerHandler = require('../peerHandler')
let fundingHandler = require('../fundingHandler')
let ports = require('../../config').ports

const { 
  FOLDER_BLOCKCHAIN,
  FOLDER_BLOCKCHAIN_GETH,
  FOLDER_CONSTELLATION,
  FILE_CONSTELLATION_PUBKEY,
  FILE_CONSTELLATION_PRIVKEY,
  FILE_CONSTELLATION_ARCHPUBKEY,
  FILE_CONSTELLATION_ARCHPRIVKEY,
  FILE_CONSTELLATION_CONFIG,
  FILE_BLOCKCHAIN_GETHIPC,
  BLOCKCHAIN_RPCPROVIDER_LOCALHOST,
  BLOCKCHAIN_WSPROVIDER_LOCALHOST,
  CONSENSUS,
  SCRIPT_BLOCKCHAIN_STARTRAFTNODE,
  NETWORKMEMBERSHIP
} = require('../../constants');

prompt.start()

let displayGethAccount = (result, cb) => {
  console.log('Account:', result.addressList[0])
  cb(null, result)
}

let startRaftNode = (result, cb) => {
  let options = { encoding: 'utf8', timeout: 100 * 1000 }
  let cmd = `./${SCRIPT_BLOCKCHAIN_STARTRAFTNODE}`
  cmd += ' ' + ports.gethNode
  cmd += ' ' + ports.gethNodeRpc
  cmd += ' ' + ports.gethNodeWsRpc
  cmd += ' ' + ports.raftHttp
  if (result.networkMembership === NETWORKMEMBERSHIP.PERMISSIONEDNODES) {
    cmd += ' permissionedNodes'
  } else {
    cmd += ' allowAll'
  }
  let child = exec(cmd, options)
  child.stdout.on('data', (data) => {
    cb(null, result)
  })
  child.stderr.on('data', (error) => {
    console.log('ERROR:', error)
    cb(error, null)
  })
}

let handleExistingFiles = (result, cb) => {
  if (result.keepExistingFiles == false) {
    let seqFunction = async.seq(
      utils.clearDirectories,
      utils.createDirectories,
      utils.getNewGethAccount,
      displayGethAccount,
      utils.generateEnode,
      utils.displayEnode,
      constellation.createNewKeys,
      constellation.createConfig
    )
    seqFunction(result, (err, res) => {
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

let handleNetworkConfiguration = (result, cb) => {
  if (result.keepExistingFiles === false) {
    let seqFunction = async.seq(
      whisper.requestNetworkMembership,
      whisper.getGenesisBlockConfig,
      whisper.getStaticNodesFile
    )
    seqFunction(result, (err, res) => {
      if (err) { return console.log('ERROR', err) }
      cb(null, res)
    })
  } else {
    cb(null, result)
  }
}

let joinRaftNetwork = (config, cb) => {
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
      configName: FILE_CONSTELLATION_CONFIG,
      folderName: FOLDER_CONSTELLATION,
      localIpAddress: config.localIpAddress,
      localPort: ports.constellation,
      remoteIpAddress: config.remoteIpAddress,
      remotePort: ports.constellation,
      publicKeyFileName: FILE_CONSTELLATION_PUBKEY,
      privateKeyFileName: FILE_CONSTELLATION_PRIVKEY,
      publicArchKeyFileName: FILE_CONSTELLATION_ARCHPUBKEY,
      privateArchKeyFileName: FILE_CONSTELLATION_ARCHPRIVKEY,
    },
    web3IpcHost: `./${FILE_BLOCKCHAIN_GETHIPC}`,
    web3RpcProvider: BLOCKCHAIN_RPCPROVIDER_LOCALHOST + ports.gethNodeRpc,
    web3WsRpcProvider: BLOCKCHAIN_WSPROVIDER_LOCALHOST + ports.gethNodeWsRpc,
    consensus: CONSENSUS.RAFT
  }

  let seqFunction = async.seq(
    handleExistingFiles,
    whisper.joinCommunicationNetwork,
    handleNetworkConfiguration,
    startRaftNode,
    utils.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    fundingHandler.monitorAccountBalances,
    whisper.publishNodeInformation
  )

  seqFunction(nodeConfig, (err, res) => {
    if (err) { return console.log('ERROR:', err) }
    console.log('[*] New node started')
    cb(err, res)
  })
}

let handleJoiningRaftNetwork = (options, cb) => {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.keepExistingFiles = options.keepExistingFiles
  console.log('In order to join the network, '
    + 'please enter the ip address of the coordinating node')
  prompt.get(['ipAddress'], (err, network) => {
    config.remoteIpAddress = network.ipAddress
    joinRaftNetwork(config, (err, result) => {
      if (err) { return console.log('ERROR:', err) }
      let networks = {
        raftNetwork: Object.assign({}, result),
        communicationNetwork: config.communicationNetwork
      }
      cb(err, networks)
    })
  })
}

exports.handleJoiningRaftNetwork = handleJoiningRaftNetwork
