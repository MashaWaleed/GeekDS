-- Modify schedules table to add granular control
ALTER TABLE schedules
    ADD COLUMN name text,
    ADD COLUMN days_of_week text[], -- Array of days: ['monday', 'tuesday', etc.]
    ADD COLUMN time_slot_start time, -- Time of day (without date)
    ADD COLUMN time_slot_end time,   -- Time of day (without date)
    ADD COLUMN valid_from date,      -- Optional date range
    ADD COLUMN valid_until date,     -- Optional date range
    ADD COLUMN is_enabled boolean DEFAULT true;

-- Add constraint for days_of_week
ALTER TABLE schedules 
    ADD CONSTRAINT valid_days_of_week 
    CHECK (days_of_week @> ARRAY[]::text[] AND 
           days_of_week <@ ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday']::text[]);

-- Add constraint for time slots
ALTER TABLE schedules
    ADD CONSTRAINT valid_time_slots
    CHECK (time_slot_start < time_slot_end);

-- Convert existing schedules to use new time slot format
UPDATE schedules SET
    time_slot_start = CAST(start_time::time AS time),
    time_slot_end = CAST(end_time::time AS time),
    days_of_week = ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
    valid_from = CAST(start_time AS date),
    is_enabled = true;

-- Make new columns non-null after migration
ALTER TABLE schedules
    ALTER COLUMN time_slot_start SET NOT NULL,
    ALTER COLUMN time_slot_end SET NOT NULL,
    ALTER COLUMN days_of_week SET NOT NULL;
