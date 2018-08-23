let whisper = require('../whisper/whisper.js')
let utils = require('../utils')

let processedAccounts = []

let accountDiff = (arrayA, arrayB) => {
  let arrayC = []
  for (let itemA of arrayA) {
    let found = false
    for (let itemB of arrayB) {
      if (itemA === itemB) {
        found = true
      }
    }
    if (found === false) {
      arrayC.push(itemA)
    }
  }
  return arrayC
}

var lastPercentage = 0;
var lastBlocksToGo = 0;
var timeInterval = 10000;

let lookAtBalances = async (result, cb) => {
  if (utils.isWeb3RpcConnectionAlive(result.web3HttpRpc)) {
    let thresholdBalance = 0.1;

    let commWeb3WsRpc = result.communicationNetwork.web3WsRpc;
    let web3HttpRpc = result.web3HttpRpc;

    web3HttpRpc.eth.isSyncing((err, syncing) => {
      if (err) { console.log('ERROR in lookAtBalances with isSyncing') }

      if (syncing && syncing.currentBlock !== null) {
        cb(true)
        return
      }

      web3HttpRpc.eth.getAccounts(async (err, allAccounts) => {
        if (err) { console.log("ERROR:", err) }
        let accounts = accountDiff(allAccounts, processedAccounts)

        for (let account of accounts) {
          let amount = (await web3HttpRpc.eth.getBalance(account)).toString()
          //console.log("AMOUNT: ", amount)
          let balance = web3HttpRpc.utils.fromWei(amount, 'ether')
          // if balance is below threshold, request topup
          if (balance < thresholdBalance) {
            whisper.requestSomeEther(commWeb3WsRpc, account, (err, res) => {
            })
          } else {
            processedAccounts.push(account)
          }
        }
        cb(true)
      })
    })
  } else {
    cb(false)
  }
}

let monitorAccountBalances = (result, cb) => {
  let web3HttpRpc = result.web3HttpRpc
  let intervalId = setInterval(() => {
    lookAtBalances(result, (connectionAlive) => {
      if (connectionAlive === false) {
        clearInterval(intervalId)
      }
    })
  }, 5 * 1000)
  cb(null, result)
}

exports.monitorAccountBalances = monitorAccountBalances
