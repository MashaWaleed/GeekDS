--
-- PostgreSQL database dump
--

-- Dumped from database version 15.13 (Debian 15.13-1.pgdg120+1)
-- Dumped by pg_dump version 15.13 (Debian 15.13-1.pgdg120+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: update_folder_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_folder_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


--
-- Name: update_playlist_timestamp(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_playlist_timestamp() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE playlists SET updated_at = NOW() WHERE id = OLD.playlist_id;
        RETURN OLD;
    ELSE
        UPDATE playlists SET updated_at = NOW() WHERE id = NEW.playlist_id;
        RETURN NEW;
    END IF;
END;
$$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: device_commands; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.device_commands (
    id integer NOT NULL,
    device_id integer,
    command text NOT NULL,
    parameters jsonb,
    status text DEFAULT 'pending'::text,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    executed_at timestamp without time zone
);


--
-- Name: device_commands_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.device_commands_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: device_commands_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.device_commands_id_seq OWNED BY public.device_commands.id;


--
-- Name: devices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devices (
    id integer NOT NULL,
    name text NOT NULL,
    ip text NOT NULL,
    status text NOT NULL,
    last_ping timestamp without time zone NOT NULL,
    current_media text,
    system_info jsonb,
    uuid uuid DEFAULT gen_random_uuid() NOT NULL
);


--
-- Name: devices_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.devices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: devices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.devices_id_seq OWNED BY public.devices.id;


--
-- Name: folders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.folders (
    id integer NOT NULL,
    name text NOT NULL,
    type text NOT NULL,
    parent_id integer,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    CONSTRAINT folders_type_check CHECK ((type = ANY (ARRAY['media'::text, 'playlist'::text])))
);


--
-- Name: folders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.folders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: folders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.folders_id_seq OWNED BY public.folders.id;


--
-- Name: media_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_files (
    id integer NOT NULL,
    filename text NOT NULL,
    duration integer,
    type text,
    upload_date timestamp without time zone DEFAULT now() NOT NULL,
    saved_filename text,
    folder_id integer
);


--
-- Name: media_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_files_id_seq OWNED BY public.media_files.id;


--
-- Name: playlist_media; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlist_media (
    playlist_id integer NOT NULL,
    media_id integer NOT NULL,
    "position" integer
);


--
-- Name: playlists; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playlists (
    id integer NOT NULL,
    name text NOT NULL,
    updated_at timestamp without time zone DEFAULT now(),
    folder_id integer
);


--
-- Name: playlists_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playlists_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playlists_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playlists_id_seq OWNED BY public.playlists.id;


--
-- Name: schedules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schedules (
    id integer NOT NULL,
    device_id integer,
    playlist_id integer,
    updated_at timestamp without time zone DEFAULT now(),
    name text,
    days_of_week text[],
    time_slot_start time without time zone,
    time_slot_end time without time zone,
    valid_from date,
    valid_until date,
    is_enabled boolean DEFAULT true,
    CONSTRAINT valid_days_of_week CHECK (((days_of_week @> ARRAY[]::text[]) AND (days_of_week <@ ARRAY['monday'::text, 'tuesday'::text, 'wednesday'::text, 'thursday'::text, 'friday'::text, 'saturday'::text, 'sunday'::text]))),
    CONSTRAINT valid_time_slots CHECK ((time_slot_start < time_slot_end))
);


--
-- Name: schedules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.schedules_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: schedules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.schedules_id_seq OWNED BY public.schedules.id;


--
-- Name: screenshot_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.screenshot_requests (
    id integer NOT NULL,
    device_id integer,
    status text DEFAULT 'pending'::text,
    requested_at timestamp without time zone DEFAULT now(),
    completed_at timestamp without time zone,
    processed_at timestamp without time zone,
    screenshot_filename text,
    error_message text
);


--
-- Name: TABLE screenshot_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.screenshot_requests IS 'Tracks screenshot requests from devices with status and results';


--
-- Name: COLUMN screenshot_requests.screenshot_filename; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.screenshot_requests.screenshot_filename IS 'Filename of uploaded screenshot (when status=completed)';


--
-- Name: COLUMN screenshot_requests.error_message; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.screenshot_requests.error_message IS 'Error details when status=failed';


--
-- Name: screenshot_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.screenshot_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: screenshot_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.screenshot_requests_id_seq OWNED BY public.screenshot_requests.id;


--
-- Name: device_commands id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_commands ALTER COLUMN id SET DEFAULT nextval('public.device_commands_id_seq'::regclass);


--
-- Name: devices id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices ALTER COLUMN id SET DEFAULT nextval('public.devices_id_seq'::regclass);


--
-- Name: folders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders ALTER COLUMN id SET DEFAULT nextval('public.folders_id_seq'::regclass);


--
-- Name: media_files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files ALTER COLUMN id SET DEFAULT nextval('public.media_files_id_seq'::regclass);


--
-- Name: playlists id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists ALTER COLUMN id SET DEFAULT nextval('public.playlists_id_seq'::regclass);


--
-- Name: schedules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules ALTER COLUMN id SET DEFAULT nextval('public.schedules_id_seq'::regclass);


--
-- Name: screenshot_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshot_requests ALTER COLUMN id SET DEFAULT nextval('public.screenshot_requests_id_seq'::regclass);


--
-- Name: device_commands device_commands_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_commands
    ADD CONSTRAINT device_commands_pkey PRIMARY KEY (id);


--
-- Name: devices devices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devices
    ADD CONSTRAINT devices_pkey PRIMARY KEY (id);


--
-- Name: folders folders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_pkey PRIMARY KEY (id);


--
-- Name: media_files media_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_pkey PRIMARY KEY (id);


--
-- Name: playlist_media playlist_media_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_media
    ADD CONSTRAINT playlist_media_pkey PRIMARY KEY (playlist_id, media_id);


--
-- Name: playlists playlists_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_pkey PRIMARY KEY (id);


--
-- Name: schedules schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_pkey PRIMARY KEY (id);


--
-- Name: screenshot_requests screenshot_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshot_requests
    ADD CONSTRAINT screenshot_requests_pkey PRIMARY KEY (id);


--
-- Name: devices_uuid_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX devices_uuid_key ON public.devices USING btree (uuid);


--
-- Name: idx_device_commands_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_commands_created ON public.device_commands USING btree (created_at);


--
-- Name: idx_device_commands_dev_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_device_commands_dev_status ON public.device_commands USING btree (device_id, status);


--
-- Name: idx_devices_ip; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_ip ON public.devices USING btree (ip);


--
-- Name: idx_devices_last_ping; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_last_ping ON public.devices USING btree (last_ping);


--
-- Name: idx_devices_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devices_status ON public.devices USING btree (status);


--
-- Name: idx_folders_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_folders_parent ON public.folders USING btree (parent_id);


--
-- Name: idx_folders_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_folders_type ON public.folders USING btree (type);


--
-- Name: idx_media_files_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_media_files_folder ON public.media_files USING btree (folder_id);


--
-- Name: idx_playlists_folder; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_playlists_folder ON public.playlists USING btree (folder_id);


--
-- Name: idx_schedules_days; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_days ON public.schedules USING gin (days_of_week);


--
-- Name: idx_schedules_device; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_device ON public.schedules USING btree (device_id);


--
-- Name: idx_schedules_device_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_schedules_device_time ON public.schedules USING btree (device_id, time_slot_start, time_slot_end);


--
-- Name: idx_screenshot_requests_dev_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screenshot_requests_dev_status ON public.screenshot_requests USING btree (device_id, status);


--
-- Name: idx_screenshot_requests_dev_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screenshot_requests_dev_time ON public.screenshot_requests USING btree (device_id, requested_at DESC);


--
-- Name: idx_screenshot_requests_device_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screenshot_requests_device_status ON public.screenshot_requests USING btree (device_id, status);


--
-- Name: idx_screenshot_requests_requested_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_screenshot_requests_requested_at ON public.screenshot_requests USING btree (requested_at);


--
-- Name: folders update_folders_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_folders_updated_at BEFORE UPDATE ON public.folders FOR EACH ROW EXECUTE FUNCTION public.update_folder_timestamp();


--
-- Name: playlist_media update_playlists_on_media_change; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_playlists_on_media_change AFTER INSERT OR DELETE OR UPDATE ON public.playlist_media FOR EACH ROW EXECUTE FUNCTION public.update_playlist_timestamp();


--
-- Name: playlists update_playlists_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_playlists_updated_at BEFORE UPDATE ON public.playlists FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: schedules update_schedules_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_schedules_updated_at BEFORE UPDATE ON public.schedules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: device_commands device_commands_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.device_commands
    ADD CONSTRAINT device_commands_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: folders folders_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.folders
    ADD CONSTRAINT folders_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.folders(id) ON DELETE CASCADE;


--
-- Name: media_files media_files_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_files
    ADD CONSTRAINT media_files_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: playlist_media playlist_media_media_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_media
    ADD CONSTRAINT playlist_media_media_id_fkey FOREIGN KEY (media_id) REFERENCES public.media_files(id) ON DELETE CASCADE;


--
-- Name: playlist_media playlist_media_playlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlist_media
    ADD CONSTRAINT playlist_media_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id) ON DELETE CASCADE;


--
-- Name: playlists playlists_folder_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playlists
    ADD CONSTRAINT playlists_folder_id_fkey FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;


--
-- Name: schedules schedules_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- Name: schedules schedules_playlist_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schedules
    ADD CONSTRAINT schedules_playlist_id_fkey FOREIGN KEY (playlist_id) REFERENCES public.playlists(id) ON DELETE CASCADE;


--
-- Name: screenshot_requests screenshot_requests_device_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.screenshot_requests
    ADD CONSTRAINT screenshot_requests_device_id_fkey FOREIGN KEY (device_id) REFERENCES public.devices(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

