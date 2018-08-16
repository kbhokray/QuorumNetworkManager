let async = require('async')
let exec = require('child_process').exec

let whisper = require('../communication/whisperNetwork')
let utils = require('../utils')
let peerHandler = require('../peerHandler')
let fundingHandler = require('../fundingHandler.js')
let ports = require('../config').ports
let setup = require('../config').setup

let {
  FOLDER_BLOCKCHAIN, FOLDER_BLOCKCHAIN_GETH, FOLDER_CONSTELLATION,
  CONSTELLATION_FILE_PUBKEY, CONSTELLATION_FILE_PRIVKEY,
  CONSTELLATION_FILE_ARCHPUBKEY, CONSTELLATION_FILE_ARCHPRIVKEY,
  BLOCKCHAINPROVIDER_RPC_LOCALHOST, BLOCKCHAINPROVIDER_WS_LOCALHOST, CONSENSUS,
  NETWORKMEMBERSHIP, FILE_BLOCKCHAIN_GETHIPC, SCRIPT_BLOCKCHAIN_STARTRAFTNODE
} = require('../constants');

function startRaftNode(result, cb) {
  console.log('[*] Starting raft node...')
  let options = { encoding: 'utf8', timeout: 100 * 1000 }
  let cmd = `./${SCRIPT_BLOCKCHAIN_STARTRAFTNODE}`
  cmd += ' ' + setup.targetGasLimit
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
  child.stdout.on('data', function (data) {
    cb(null, result)
  })
  child.stderr.on('data', function (error) {
    console.log('Start raft node ERROR:', error)
    cb(error, null)
  })
}

let startNewRaftNetwork = (config, cb) => {
  console.log('[*] Starting new node...')

  let nodeConfig = {
    localIpAddress: config.localIpAddress,
    networkMembership: config.networkMembership,
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
      remoteIpAddress: null,
      remotePort: ports.constellation,
      publicKeyFileName: CONSTELLATION_FILE_PUBKEY,
      privateKeyFileName: CONSTELLATION_FILE_PRIVKEY,
      publicArchKeyFileName: CONSTELLATION_FILE_ARCHPUBKEY,
      privateArchKeyFileName: CONSTELLATION_FILE_ARCHPRIVKEY,
    },
    web3IpcHost: FILE_BLOCKCHAIN_GETHIPC,
    web3RpcProvider: BLOCKCHAINPROVIDER_RPC_LOCALHOST + ports.gethNodeRpc,
    web3WsRpcProvider: BLOCKCHAINPROVIDER_WS_LOCALHOST + ports.gethNodeWsRpc,
    consensus: CONSENSUS.RAFT
  }

  let seqFunction = async.seq(
    utils.handleExistingFiles,
    utils.generateEnode,
    utils.displayEnode,
    whisper.startCommunicationNetwork,
    utils.handleNetworkConfiguration,
    startRaftNode,
    utils.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    whisper.addEtherResponseHandler,
    fundingHandler.monitorAccountBalances,
    whisper.existingRaftNetworkMembership,
    whisper.publishNodeInformation
  )

  seqFunction(nodeConfig, function (err, res) {
    if (err) { return console.log('ERROR', err) }
    console.log('[*] Done')
    cb(err, res)
  })
}

let startNewNetwork = (options, cb) => {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.networkMembership = options.networkMembership
  config.keepExistingFiles = options.keepExistingFiles
  startNewRaftNetwork(config, (err, result) => {
    if (err) { return console.log('ERROR', err) }
    config.raftNetwork = Object.assign({}, result)
    let networks = {
      raftNetwork: config.raftNetwork,
      communicationNetwork: config.communicationNetwork
    }
    cb(err, networks)
  })
}

exports.startNewNetwork = startNewNetwork