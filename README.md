# ig-comment-backup
Backup of instagram comments


CRON JOB
55 */2 * * * cd PATH_TO_FOLDER && ./CRON_SCRIPT.sh

ADD/EDIT CRON JOB
env EDITOR=nano crontab -e

LIST ALL CRON JOBS
crontab -l