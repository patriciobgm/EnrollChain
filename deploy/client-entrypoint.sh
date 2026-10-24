#!/bin/sh
set -eu
if [ "${1:-web}" = "worker" ]; then
    reminder_tick=0
    while true; do
        python manage.py deploy_local_blockchain --rpc http://hardhat:8545
        python manage.py process_blockchain --reconcile-chain
        if [ "$reminder_tick" -eq 0 ]; then
            python manage.py send_requirement_reminders
        fi
        reminder_tick=$(( (reminder_tick + 1) % 60 ))
        sleep 10
    done
fi
python manage.py migrate --noinput
python manage.py setup_admissions_roles
python manage.py seed_client_test
python manage.py deploy_local_blockchain --rpc http://hardhat:8545
exec gunicorn config.wsgi:application --bind 0.0.0.0:8000 --workers 2 --threads 2 --timeout 90 --access-logfile -
