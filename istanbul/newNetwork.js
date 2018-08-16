let async = require('async')
let exec = require('child_process').exec

let whisper = require('../communication/whisperNetwork')
let utils = require('../utils')
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
  CONSENSUS, SCRIPT_BLOCKCHAIN_STARTISTANBULNODE
} = require('../constants')

function startIstanbulNode(result, cb) {
  console.log('[*] Starting istanbul node...')
  let options = { encoding: 'utf8', timeout: 100 * 1000 }
  let cmd = `./${SCRIPT_BLOCKCHAIN_STARTISTANBULNODE}`
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

function startNewIstanbulNetwork(config, cb) {
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
    web3IpcHost: `./${FILE_BLOCKCHAIN_GETHIPC}`,
    web3RpcProvider: BLOCKCHAINPROVIDER_RPC_LOCALHOST + ports.gethNodeRpc,
    web3WsRpcProvider: BLOCKCHAINPROVIDER_WS_LOCALHOST + ports.gethNodeWsRpc,
    consensus: CONSENSUS.ISTANBUL
  }

  let seqFunction = async.seq(
    utils.handleExistingFiles,
    whisper.startCommunicationNetwork,
    utils.handleNetworkConfiguration,
    startIstanbulNode,
    utils.createWeb3Connection,
    whisper.addEnodeResponseHandler,
    peerHandler.listenForNewEnodes,
    whisper.addEtherResponseHandler,
    fundingHandler.monitorAccountBalances,
    whisper.existingIstanbulNetworkMembership,
    whisper.publishNodeInformation
  )

  seqFunction(nodeConfig, function (err, res) {
    if (err) { return console.log('ERROR', err) }
    console.log('[*] Done')
    cb(err, res)
  })
}
function startNewNetwork(options, cb) {
  config = {}
  config.localIpAddress = options.localIpAddress
  config.networkMembership = options.networkMembership
  config.keepExistingFiles = options.keepExistingFiles
  startNewIstanbulNetwork(config, function (err, result) {
    if (err) { return console.log('ERROR', err) }
    config.istanbulNetwork = Object.assign({}, result)
    let networks = {
      istanbulNetwork: config.istanbulNetwork,
      communicationNetwork: config.communicationNetwork
    }
    cb(err, networks)
  })
}

exports.startNewNetwork = startNewNetwork
