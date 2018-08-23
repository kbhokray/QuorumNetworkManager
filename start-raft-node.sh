#!/bin/bash
set -u
set -e

geth --datadir quorum/blockchain init quorum/blockchain/quorum-genesis.json &>> /dev/null

nohup constellation-node quorum/constellation.config &> quorum/constellation/constellation.log &

sleep 5

FLAGS="--datadir quorum/blockchain --targetgaslimit $1 --shh --port $2 --unlock 0 --password passwords.txt --raft"

RPC_API="admin,db,eth,debug,miner,net,shh,txpool,personal,web3,quorum,raft"
HTTP_RPC_ARGS="--rpc --rpcaddr 0.0.0.0 --rpcport $3 --rpcapi $RPC_API"
WS_RPC_ARGS="--ws --wsaddr 0.0.0.0 --wsport $4 --wsapi $RPC_API --wsorigins=*"

RAFT_ARGS="--raftport $5"

if [ "$6" == "permissionedNodes" ]
  then
  RAFT_ARGS="$RAFT_ARGS --permissioned blockchain"
fi
if [ "$#" == 7 ]
  then
  RAFT_ARGS="$RAFT_ARGS --raftjoinexisting $7"
fi

ALL_ARGS="$FLAGS $HTTP_RPC_ARGS $WS_RPC_ARGS $RAFT_ARGS"

PRIVATE_CONFIG=quorum/constellation.config nohup geth $ALL_ARGS &> quorum/blockchain/geth.log &

echo "[*] Node started"
