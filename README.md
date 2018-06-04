# ig-comment-backup
Backup of instagram comments

## Add node modules
```
yarn install
```

## Project setup
This script will create *mongod.conf* file and all *mongo* folders where the DB will be saved
```
yarn setup
```

## Start mongo
```
yarn mongo:start
```

Additionally it is possible to stop mongo with yarn.
```
yarn mongo:stop
```

## Cron script
You need to create a script to be executed by the cron task. This script will define environment variables of the Instagram image to backup and the DB path where the comments are saved.
```
#!/bin/sh
CRON=true MONGODB_URI=mongodb://localhost/ig-comments CODE=PHOTO_SHORTCODE /usr/local/bin/node index
```
*__NOTE__: node path should be absolute and point to the node bin file in the file system*

## Cron setup
This is how to setup a cron job to execute the script

### Edit crontab with nano
```
env EDITOR=nano crontab -e
```

### Create cron job
This scrip will execute at minute 0 every two hours.

```
0 */2 * * * cd PATH_TO_FOLDER && ./CRON_SCRIPT.sh
```

### Check if cron job is saved
```
crontab -l
```