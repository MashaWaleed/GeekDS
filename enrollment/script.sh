#!/system/bin/sh

while true ; do
	cond=$(dumpsys activity activities | grep topResumedActivity=  | awk '{ print $3}')
	dumpsys window windows | grep -E 'mCurrentFocus' | grep 'com.example.geekds'
	#[ "${cond}" = "com.example.geekds/.MainActivity}" ] && echo "running!" 
	[ "$?" -eq 0 ] || { am force-stop com.example.geekds;am start com.example.geekds/.MainActivity;}
	sleep 20s
done
