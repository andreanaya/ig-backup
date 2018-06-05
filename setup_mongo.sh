#!/bin/sh
mkdir mongo
mkdir mongo/log
mkdir mongo/db
touch mongo/mongod.pid

cat <<EOF >mongod.conf
systemLog:
   destination: file
   path: mongo/log/mongod.log
   logAppend: true
storage:
   dbPath: mongo/db
   journal: 
        enabled: true
processManagement:
    fork: true

EOF