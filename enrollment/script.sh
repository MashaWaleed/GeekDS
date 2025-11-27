#!/system/bin/sh
dumpsys deviceidle whitelist +com.example.geekds
while true ; do
	cond=$(dumpsys activity activities | grep topResumedActivity=  | awk '{ print $3}')
	[ "${cond}" = "com.example.geekds/.MainActivity}" ] && echo "running!" || { am force-stop com.example.geekds;am start com.example.geekds/.MainActivity;}
	sleep 15s
done

    
     

