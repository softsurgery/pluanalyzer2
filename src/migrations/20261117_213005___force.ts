import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'urban_planner', 'analyst', 'viewer');
  CREATE TYPE "public"."enum_projects_territory" AS ENUM('amp', 'gpu');
  CREATE TYPE "public"."enum_projects_status" AS ENUM('draft', 'active', 'validated', 'archived');
  CREATE TYPE "public"."enum_analyses_status" AS ENUM('running', 'completed', 'partial', 'failed');
  CREATE TYPE "public"."enum_analysis_snapshots_validation_status" AS ENUM('valid', 'warnings', 'incomplete', 'invalid');
  CREATE TYPE "public"."enum_documents_document_type" AS ENUM('reglement', 'oap', 'annexe', 'zonage', 'rapport', 'export');
  CREATE TYPE "public"."enum_documents_extraction_status" AS ENUM('pending', 'extracted', 'ocr_required', 'ocr_completed', 'failed');
  CREATE TYPE "public"."enum_regulations_source_type" AS ENUM('pdf_extraction', 'gpu', 'amp_arcgis', 'manual');
  CREATE TYPE "public"."enum_gis_data_provider" AS ENUM('ign_apicarto_gpu', 'ign_apicarto_cadastre', 'amp_arcgis', 'gpu_api', 'ign_geocoding');
  CREATE TYPE "public"."enum_executions_status" AS ENUM('queued', 'running', 'completed', 'partial', 'failed');
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"full_name" varchar NOT NULL,
  	"role" "enum_users_role" DEFAULT 'urban_planner' NOT NULL,
  	"organization" varchar DEFAULT 'Métropole Aix-Marseille-Provence',
  	"territory_focus" varchar DEFAULT 'Aix-Marseille-Provence',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "projects" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"description" varchar,
  	"territory" "enum_projects_territory" DEFAULT 'amp',
  	"commune" varchar DEFAULT 'Aix-en-Provence' NOT NULL,
  	"code_insee" varchar DEFAULT '13001' NOT NULL,
  	"status" "enum_projects_status" DEFAULT 'active',
  	"owner_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "projects_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"parcels_id" integer,
  	"documents_id" integer
  );
  
  CREATE TABLE "analyses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"project_id" integer NOT NULL,
  	"parcel_id" integer,
  	"status" "enum_analyses_status" DEFAULT 'completed',
  	"current_version" numeric DEFAULT 1 NOT NULL,
  	"latest_snapshot_id" integer,
  	"created_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "parcels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"idu" varchar NOT NULL,
  	"code_insee" varchar NOT NULL,
  	"commune" varchar,
  	"section" varchar NOT NULL,
  	"numero" varchar NOT NULL,
  	"prefixe" varchar DEFAULT '000',
  	"surface_m2" numeric,
  	"address" varchar,
  	"centroid_lng" numeric,
  	"centroid_lat" numeric,
  	"geometry" jsonb,
  	"raw_cadastre" jsonb,
  	"source" varchar DEFAULT 'IGN API Carto Cadastre',
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "prompt_history" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"prompt_preview" varchar NOT NULL,
  	"prompt_text" varchar NOT NULL,
  	"submitted_payload" jsonb NOT NULL,
  	"version" numeric NOT NULL,
  	"is_replay" boolean DEFAULT false,
  	"project_id" integer NOT NULL,
  	"analysis_id" integer NOT NULL,
  	"snapshot_id" integer NOT NULL,
  	"execution_id" integer,
  	"created_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analysis_snapshots" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"snapshot_label" varchar NOT NULL,
  	"analysis_id" integer NOT NULL,
  	"project_id" integer NOT NULL,
  	"parcel_id" integer,
  	"version" numeric NOT NULL,
  	"replayed_from_id" integer,
  	"original_prompt" varchar NOT NULL,
  	"submitted_payload" jsonb NOT NULL,
  	"address_query" varchar,
  	"cadastral_references" jsonb,
  	"geocoding_result" jsonb,
  	"zone_code" varchar,
  	"zoning_and_gis" jsonb,
  	"extracted_articles" jsonb,
  	"regulatory_interpretation" jsonb,
  	"validation_status" "enum_analysis_snapshots_validation_status" DEFAULT 'incomplete',
  	"validation_report" jsonb,
  	"constructibility_calculations" jsonb,
  	"archicad_export" jsonb,
  	"ai_responses" jsonb,
  	"execution_id" integer,
  	"execution_logs" jsonb,
  	"execution_errors" jsonb,
  	"created_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "analysis_snapshots_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"gis_data_id" integer,
  	"documents_id" integer,
  	"regulations_id" integer
  );
  
  CREATE TABLE "documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"document_type" "enum_documents_document_type" DEFAULT 'reglement' NOT NULL,
  	"commune" varchar,
  	"code_insee" varchar,
  	"zone_code" varchar,
  	"source_url" varchar,
  	"gpu_document_id" varchar,
  	"page_count" numeric,
  	"extraction_status" "enum_documents_extraction_status" DEFAULT 'pending',
  	"extracted_text" varchar,
  	"extraction_metadata" jsonb,
  	"project_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  CREATE TABLE "regulations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"zone_code" varchar NOT NULL,
  	"zone_label" varchar,
  	"commune" varchar,
  	"code_insee" varchar,
  	"article_number" varchar NOT NULL,
  	"raw_text" varchar NOT NULL,
  	"source_type" "enum_regulations_source_type" DEFAULT 'pdf_extraction',
  	"source_document_id" integer,
  	"structured_rules_max_height_m" numeric,
  	"structured_rules_max_eaves_height_m" numeric,
  	"structured_rules_max_storeys" numeric,
  	"structured_rules_max_coverage_ratio" numeric,
  	"structured_rules_front_setback_m" numeric,
  	"structured_rules_side_setback_m" numeric,
  	"structured_rules_rear_setback_m" numeric,
  	"structured_rules_min_green_ratio" numeric,
  	"structured_rules_parking_per_dwelling" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "gis_data" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"provider" "enum_gis_data_provider" NOT NULL,
  	"layer_name" varchar NOT NULL,
  	"parcel_id" integer,
  	"commune" varchar,
  	"code_insee" varchar,
  	"zone_code" varchar,
  	"zone_type" varchar,
  	"prescriptions" jsonb,
  	"raw_response" jsonb NOT NULL,
  	"retrieved_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "executions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"execution_code" varchar NOT NULL,
  	"status" "enum_executions_status" DEFAULT 'queued' NOT NULL,
  	"analysis_id" integer,
  	"started_at" timestamp(3) with time zone NOT NULL,
  	"completed_at" timestamp(3) with time zone,
  	"duration_ms" numeric,
  	"steps" jsonb,
  	"logs" jsonb,
  	"errors" jsonb,
  	"triggered_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"projects_id" integer,
  	"analyses_id" integer,
  	"parcels_id" integer,
  	"prompt_history_id" integer,
  	"analysis_snapshots_id" integer,
  	"documents_id" integer,
  	"regulations_id" integer,
  	"gis_data_id" integer,
  	"executions_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "projects_rels" ADD CONSTRAINT "projects_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_rels" ADD CONSTRAINT "projects_rels_parcels_fk" FOREIGN KEY ("parcels_id") REFERENCES "public"."parcels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "projects_rels" ADD CONSTRAINT "projects_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analyses" ADD CONSTRAINT "analyses_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analyses" ADD CONSTRAINT "analyses_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analyses" ADD CONSTRAINT "analyses_latest_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("latest_snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analyses" ADD CONSTRAINT "analyses_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_snapshot_id_analysis_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "prompt_history" ADD CONSTRAINT "prompt_history_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_replayed_from_id_analysis_snapshots_id_fk" FOREIGN KEY ("replayed_from_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analysis_snapshots" ADD CONSTRAINT "analysis_snapshots_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "analysis_snapshots_rels" ADD CONSTRAINT "analysis_snapshots_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analysis_snapshots_rels" ADD CONSTRAINT "analysis_snapshots_rels_gis_data_fk" FOREIGN KEY ("gis_data_id") REFERENCES "public"."gis_data"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analysis_snapshots_rels" ADD CONSTRAINT "analysis_snapshots_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "analysis_snapshots_rels" ADD CONSTRAINT "analysis_snapshots_rels_regulations_fk" FOREIGN KEY ("regulations_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "regulations" ADD CONSTRAINT "regulations_source_document_id_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."documents"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "gis_data" ADD CONSTRAINT "gis_data_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "executions" ADD CONSTRAINT "executions_analysis_id_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."analyses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "executions" ADD CONSTRAINT "executions_triggered_by_id_users_id_fk" FOREIGN KEY ("triggered_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_projects_fk" FOREIGN KEY ("projects_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analyses_fk" FOREIGN KEY ("analyses_id") REFERENCES "public"."analyses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parcels_fk" FOREIGN KEY ("parcels_id") REFERENCES "public"."parcels"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_prompt_history_fk" FOREIGN KEY ("prompt_history_id") REFERENCES "public"."prompt_history"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_analysis_snapshots_fk" FOREIGN KEY ("analysis_snapshots_id") REFERENCES "public"."analysis_snapshots"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_documents_fk" FOREIGN KEY ("documents_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_regulations_fk" FOREIGN KEY ("regulations_id") REFERENCES "public"."regulations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_gis_data_fk" FOREIGN KEY ("gis_data_id") REFERENCES "public"."gis_data"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_executions_fk" FOREIGN KEY ("executions_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "projects_code_insee_idx" ON "projects" USING btree ("code_insee");
  CREATE INDEX "projects_owner_idx" ON "projects" USING btree ("owner_id");
  CREATE INDEX "projects_updated_at_idx" ON "projects" USING btree ("updated_at");
  CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");
  CREATE INDEX "projects_rels_order_idx" ON "projects_rels" USING btree ("order");
  CREATE INDEX "projects_rels_parent_idx" ON "projects_rels" USING btree ("parent_id");
  CREATE INDEX "projects_rels_path_idx" ON "projects_rels" USING btree ("path");
  CREATE INDEX "projects_rels_parcels_id_idx" ON "projects_rels" USING btree ("parcels_id");
  CREATE INDEX "projects_rels_documents_id_idx" ON "projects_rels" USING btree ("documents_id");
  CREATE INDEX "analyses_project_idx" ON "analyses" USING btree ("project_id");
  CREATE INDEX "analyses_parcel_idx" ON "analyses" USING btree ("parcel_id");
  CREATE INDEX "analyses_latest_snapshot_idx" ON "analyses" USING btree ("latest_snapshot_id");
  CREATE INDEX "analyses_created_by_idx" ON "analyses" USING btree ("created_by_id");
  CREATE INDEX "analyses_updated_at_idx" ON "analyses" USING btree ("updated_at");
  CREATE INDEX "analyses_created_at_idx" ON "analyses" USING btree ("created_at");
  CREATE UNIQUE INDEX "parcels_idu_idx" ON "parcels" USING btree ("idu");
  CREATE INDEX "parcels_code_insee_idx" ON "parcels" USING btree ("code_insee");
  CREATE INDEX "parcels_updated_at_idx" ON "parcels" USING btree ("updated_at");
  CREATE INDEX "parcels_created_at_idx" ON "parcels" USING btree ("created_at");
  CREATE INDEX "prompt_history_project_idx" ON "prompt_history" USING btree ("project_id");
  CREATE INDEX "prompt_history_analysis_idx" ON "prompt_history" USING btree ("analysis_id");
  CREATE INDEX "prompt_history_snapshot_idx" ON "prompt_history" USING btree ("snapshot_id");
  CREATE INDEX "prompt_history_execution_idx" ON "prompt_history" USING btree ("execution_id");
  CREATE INDEX "prompt_history_created_by_idx" ON "prompt_history" USING btree ("created_by_id");
  CREATE INDEX "prompt_history_updated_at_idx" ON "prompt_history" USING btree ("updated_at");
  CREATE INDEX "prompt_history_created_at_idx" ON "prompt_history" USING btree ("created_at");
  CREATE INDEX "analysis_snapshots_analysis_idx" ON "analysis_snapshots" USING btree ("analysis_id");
  CREATE INDEX "analysis_snapshots_project_idx" ON "analysis_snapshots" USING btree ("project_id");
  CREATE INDEX "analysis_snapshots_parcel_idx" ON "analysis_snapshots" USING btree ("parcel_id");
  CREATE INDEX "analysis_snapshots_version_idx" ON "analysis_snapshots" USING btree ("version");
  CREATE INDEX "analysis_snapshots_replayed_from_idx" ON "analysis_snapshots" USING btree ("replayed_from_id");
  CREATE INDEX "analysis_snapshots_zone_code_idx" ON "analysis_snapshots" USING btree ("zone_code");
  CREATE INDEX "analysis_snapshots_execution_idx" ON "analysis_snapshots" USING btree ("execution_id");
  CREATE INDEX "analysis_snapshots_created_by_idx" ON "analysis_snapshots" USING btree ("created_by_id");
  CREATE INDEX "analysis_snapshots_updated_at_idx" ON "analysis_snapshots" USING btree ("updated_at");
  CREATE INDEX "analysis_snapshots_created_at_idx" ON "analysis_snapshots" USING btree ("created_at");
  CREATE INDEX "analysis_snapshots_rels_order_idx" ON "analysis_snapshots_rels" USING btree ("order");
  CREATE INDEX "analysis_snapshots_rels_parent_idx" ON "analysis_snapshots_rels" USING btree ("parent_id");
  CREATE INDEX "analysis_snapshots_rels_path_idx" ON "analysis_snapshots_rels" USING btree ("path");
  CREATE INDEX "analysis_snapshots_rels_gis_data_id_idx" ON "analysis_snapshots_rels" USING btree ("gis_data_id");
  CREATE INDEX "analysis_snapshots_rels_documents_id_idx" ON "analysis_snapshots_rels" USING btree ("documents_id");
  CREATE INDEX "analysis_snapshots_rels_regulations_id_idx" ON "analysis_snapshots_rels" USING btree ("regulations_id");
  CREATE INDEX "documents_code_insee_idx" ON "documents" USING btree ("code_insee");
  CREATE INDEX "documents_zone_code_idx" ON "documents" USING btree ("zone_code");
  CREATE INDEX "documents_project_idx" ON "documents" USING btree ("project_id");
  CREATE INDEX "documents_updated_at_idx" ON "documents" USING btree ("updated_at");
  CREATE INDEX "documents_created_at_idx" ON "documents" USING btree ("created_at");
  CREATE UNIQUE INDEX "documents_filename_idx" ON "documents" USING btree ("filename");
  CREATE INDEX "regulations_zone_code_idx" ON "regulations" USING btree ("zone_code");
  CREATE INDEX "regulations_code_insee_idx" ON "regulations" USING btree ("code_insee");
  CREATE INDEX "regulations_source_document_idx" ON "regulations" USING btree ("source_document_id");
  CREATE INDEX "regulations_updated_at_idx" ON "regulations" USING btree ("updated_at");
  CREATE INDEX "regulations_created_at_idx" ON "regulations" USING btree ("created_at");
  CREATE INDEX "gis_data_parcel_idx" ON "gis_data" USING btree ("parcel_id");
  CREATE INDEX "gis_data_code_insee_idx" ON "gis_data" USING btree ("code_insee");
  CREATE INDEX "gis_data_zone_code_idx" ON "gis_data" USING btree ("zone_code");
  CREATE INDEX "gis_data_updated_at_idx" ON "gis_data" USING btree ("updated_at");
  CREATE INDEX "gis_data_created_at_idx" ON "gis_data" USING btree ("created_at");
  CREATE UNIQUE INDEX "executions_execution_code_idx" ON "executions" USING btree ("execution_code");
  CREATE INDEX "executions_analysis_idx" ON "executions" USING btree ("analysis_id");
  CREATE INDEX "executions_triggered_by_idx" ON "executions" USING btree ("triggered_by_id");
  CREATE INDEX "executions_updated_at_idx" ON "executions" USING btree ("updated_at");
  CREATE INDEX "executions_created_at_idx" ON "executions" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("projects_id");
  CREATE INDEX "payload_locked_documents_rels_analyses_id_idx" ON "payload_locked_documents_rels" USING btree ("analyses_id");
  CREATE INDEX "payload_locked_documents_rels_parcels_id_idx" ON "payload_locked_documents_rels" USING btree ("parcels_id");
  CREATE INDEX "payload_locked_documents_rels_prompt_history_id_idx" ON "payload_locked_documents_rels" USING btree ("prompt_history_id");
  CREATE INDEX "payload_locked_documents_rels_analysis_snapshots_id_idx" ON "payload_locked_documents_rels" USING btree ("analysis_snapshots_id");
  CREATE INDEX "payload_locked_documents_rels_documents_id_idx" ON "payload_locked_documents_rels" USING btree ("documents_id");
  CREATE INDEX "payload_locked_documents_rels_regulations_id_idx" ON "payload_locked_documents_rels" USING btree ("regulations_id");
  CREATE INDEX "payload_locked_documents_rels_gis_data_id_idx" ON "payload_locked_documents_rels" USING btree ("gis_data_id");
  CREATE INDEX "payload_locked_documents_rels_executions_id_idx" ON "payload_locked_documents_rels" USING btree ("executions_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "projects" CASCADE;
  DROP TABLE "projects_rels" CASCADE;
  DROP TABLE "analyses" CASCADE;
  DROP TABLE "parcels" CASCADE;
  DROP TABLE "prompt_history" CASCADE;
  DROP TABLE "analysis_snapshots" CASCADE;
  DROP TABLE "analysis_snapshots_rels" CASCADE;
  DROP TABLE "documents" CASCADE;
  DROP TABLE "regulations" CASCADE;
  DROP TABLE "gis_data" CASCADE;
  DROP TABLE "executions" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_projects_territory";
  DROP TYPE "public"."enum_projects_status";
  DROP TYPE "public"."enum_analyses_status";
  DROP TYPE "public"."enum_analysis_snapshots_validation_status";
  DROP TYPE "public"."enum_documents_document_type";
  DROP TYPE "public"."enum_documents_extraction_status";
  DROP TYPE "public"."enum_regulations_source_type";
  DROP TYPE "public"."enum_gis_data_provider";
  DROP TYPE "public"."enum_executions_status";`)
}
