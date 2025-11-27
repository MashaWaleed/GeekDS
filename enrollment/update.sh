#!/bin/sh
###############
#
# Known Vars:
# ( version, size, size_bytes, last_modified)
# Usable now:
# version
#
################
while true; do
	response="$(busybox wget -o /dev/null -O - 127.0.0.1/update.json)"
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

		declare -- "${index}"="${val//\"*/}"
	done <<< "${response}" 
	#echo "${response}"
	#echo "$version" "$size" "$size_bytes" "${last_modified}"
	current="$(dumpsys package com.example.geekds | grep 'versionName')"
	current="${current##*=}"
	[[ "$current" < "$version" ]] && wget -O /data/app.apk 127.0.0.1:80/app.apk && pm install /data/app.apk
	sleep 3600s
done
