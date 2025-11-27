-- Critical indexes to support scale and reduce sequential scans
-- Devices
CREATE INDEX IF NOT EXISTS idx_devices_ip ON devices(ip);
CREATE INDEX IF NOT EXISTS idx_devices_last_ping ON devices(last_ping);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);

-- Schedules
CREATE INDEX IF NOT EXISTS idx_schedules_device ON schedules(device_id);
CREATE INDEX IF NOT EXISTS idx_schedules_device_time ON schedules(device_id, time_slot_start, time_slot_end);
-- days_of_week is a text[]; use GIN for array operators like &&
CREATE INDEX IF NOT EXISTS idx_schedules_days ON schedules USING GIN (days_of_week);

-- Screenshot requests
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_dev_status ON screenshot_requests(device_id, status);
CREATE INDEX IF NOT EXISTS idx_screenshot_requests_dev_time ON screenshot_requests(device_id, requested_at DESC);

-- Device commands
CREATE INDEX IF NOT EXISTS idx_device_commands_dev_status ON device_commands(device_id, status);
CREATE INDEX IF NOT EXISTS idx_device_commands_created ON device_commands(created_at);
