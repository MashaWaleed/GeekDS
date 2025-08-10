-- Add new table for individual media schedules
CREATE TABLE public.media_schedules (
    id integer NOT NULL,
    device_id integer,
    media_id integer,
    start_time timestamp without time zone NOT NULL,
    end_time timestamp without time zone NOT NULL,
    repeat_pattern text, -- e.g., 'tuesday,thursday' or 'daily' or 'weekly'
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);

-- Create sequence for media_schedules
CREATE SEQUENCE public.media_schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

ALTER TABLE public.media_schedules_id_seq OWNER TO postgres;
ALTER SEQUENCE public.media_schedules_id_seq OWNED BY public.media_schedules.id;
ALTER TABLE ONLY public.media_schedules ALTER COLUMN id SET DEFAULT nextval('public.media_schedules_id_seq'::regclass);

-- Add primary key and foreign key constraints
ALTER TABLE ONLY public.media_schedules
    ADD CONSTRAINT media_schedules_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.media_schedules
    ADD CONSTRAINT media_schedules_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.media_schedules
    ADD CONSTRAINT media_schedules_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;

-- Add trigger for updated_at
CREATE TRIGGER update_media_schedules_updated_at 
    BEFORE UPDATE ON public.media_schedules 
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();