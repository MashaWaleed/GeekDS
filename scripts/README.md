# GeekDS Scripts

## 📁 Directory Structure

### `/deployment/`
Device setup and app deployment scripts:
- `install-as-system-app.sh` - Install GeekDS as system app (requires root)
- `setup-device-owner.sh` - Set app as Device Owner (requires factory reset)
- `update_devices_adb.py` - Batch update all devices via network ADB
- `add_api_imports.sh` - Add API imports to frontend components

### `/testing/`
Load testing and performance testing scripts:
- `load-test.js` - Artillery.io load test configuration
- `run-load-test.sh` - Run load tests
- `start-load-test.sh` - Start load test with logging

### `/monitoring/`
System monitoring and health check scripts:
- `monitor.sh` - System health monitoring

## 🚀 Usage

### Deploy to Device
```bash
cd deployment
./install-as-system-app.sh
```

### Run Load Tests
```bash
cd testing
./run-load-test.sh
```

---
Last updated: 2024-11-19
