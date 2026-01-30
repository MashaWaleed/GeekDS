#!/bin/sh
###############
#
# Known Vars:
# ( version, size, size_bytes, last_modified)
# Usable now:
# version
#
################
logger(){
	log -t 'GeekUpdater' "$1"
}
while true; do
	response="$(busybox wget -q -O - 192.168.1.254:5000/api/devices/apk/version)"
	del=$'\n\t{}'
	response="${response//[$del]/}" #del newlines, tabs and { , }
	response="${response//  / }" #squeeze all spaces
	response="${response//,/$'\n'}" #replace every comma with a newline

	while IFS=',' read line ;do 		#for every line read
		#echo "$line"
		index="${line#*\"}" 		#remove leading spaces + ' " ' 
		index="${index%%\"*}" 		#remove second ' " ' + rest of the line

		val="${line#*:}" 		#remove anything preceeding ':'
		val="${val#*\"}" 		#remove first ' " '

		#declare -- "${index}"="${val//\"*/}"
		eval "${index}=${val//\"*/}"
	done <<< "${response}" 
	logger "Server reports: $version"
	#echo "${response}"
	#echo "$version" "$size" "$size_bytes" "${last_modified}"
	current="$(dumpsys package com.example.geekds | grep 'versionName')"
	current="${current##*=}" 
	logger "Current Version : $current"
	[[ "$current" < "$version" ]] && logger "$(busybox wget -q -O /sdcard/app.apk 192.168.1.254:5000/api/devices/apk/latest 2>&1)" && logger "$(pm install -r -g /sdcard/app.apk 2>&1)"
	sleep 60s
done
