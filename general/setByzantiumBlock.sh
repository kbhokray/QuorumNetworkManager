#!/bin/bash

# check current location
if [ $# == 0 ]
then
  echo "Please provide the block number as first parameter"
else
  if [ "${PWD##*/}" == 'QuorumNetworkManager' ]
  then
    echo "Setting byzantiumBlock to $1"
    # gracefully shut the client down
    pm2 stop setupFromConfig
    ./shutdown.sh
    killall geth # kill any remaining geth processes

    # create a backup of the keystore and nodekey
    mkdir -p ../backup_QNM
    cp -r Blockchain/keystore ../backup_QNM/.
    cp Blockchain/geth/nodekey ../backup_QNM/.
    if [ -d "whisper_keys" ]
    then
      cp -r whisper_keys ../backup_QNM/.
    fi

    # delete pending transactions
    rm Blockchain/geth/transactions.rlp
    
    # if resync is requested
    if [ $# == 3 ]
    then
      if [ $3 == "removechain" ]
      then
        rm -rf Blockchain/geth/chaindata/
        rm -rf Blockchain/geth/lightchaindata/
        rm -rf Blockchain/geth/LOCK
      else
        echo "Unknown parameter $3"
      fi
    fi

    # add the byzantiumBlock to the genesis config
    node addByzantiumBlockToGenesis.js $1

    # restart the client
    if [ $# == 2 ]
    then
      KEEP_FILES=true TARGET_GAS_LIMIT=$2 pm2 --update-env start setupFromConfig
    else
      KEEP_FILES=true pm2 --update-env start setupFromConfig
    fi
  else
    echo "Not in QuorumNetworkManager directory!"
  fi
fi
