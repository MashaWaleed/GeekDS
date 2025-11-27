#!/bin/bash
report(){
	echo -n "Content-Type: text/plain"
	echo ''
	[ -v $1 ] && echo -n 'Failure' && return
}
ip=${QUERY_STRING%%&*}
ip=${ip##*=}
QUERY_SRTING=${QUERY_STRING#*&}
other=${QUERY_STRING##*=}
adb disconnect
adb connect ${ip}:3222
adb root
adb disconnect
adb connect ${ip}:3222
adb remount
adb install app-debug.apk
adb push script.sh /system/bin/script.sh
adb shell chmod +x /system/bin/script.sh
adb push startapp.rc /system/etc/init
adb shell chmod 644 /system/etc/init/startapp.rc
adb push updater.rc /system/etc/init
adb shell chmod 644 /system/etc/init/updater.rc
adb push update.sh /system/bin
adb shell chmod +x /system/bin/update.sh
adb push boot.mp4 /system/media
adb shell chmod 644 /system/media/boot.mp4
adb push logo.img /sdcard
adb shell dd if=/sdcard/logo.img of=/dev/block/by-name/logo.img

adb reboot
