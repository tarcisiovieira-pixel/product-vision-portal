export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      hangars: {
        Row: {
          code: string
          created_at: string
          elevation_km: number
          id: string
          lat: number
          lng: number
          name: string
          sector: string
          storm_alert: boolean
          status: string
        }
        Insert: {
          code: string
          created_at?: string
          elevation_km?: number
          id?: string
          lat: number
          lng: number
          name: string
          sector: string
          storm_alert?: boolean
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          elevation_km?: number
          id?: string
          lat?: number
          lng?: number
          name?: string
          sector?: string
          storm_alert?: boolean
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          martian_credits: number
          pilot_license: Database["public"]["Enums"]["pilot_license"]
          space_credential_id: string | null
          safety_reputation_score: number
          flight_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          martian_credits?: number
          pilot_license?: Database["public"]["Enums"]["pilot_license"]
          space_credential_id?: string | null
          safety_reputation_score?: number
          flight_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          martian_credits?: number
          pilot_license?: Database["public"]["Enums"]["pilot_license"]
          space_credential_id?: string | null
          safety_reputation_score?: number
          flight_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rentals: {
        Row: {
          created_at: string
          dropoff_hangar_id: string
          end_sol: number
          id: string
          pickup_hangar_id: string
          start_sol: number
          status: string
          total_credits: number
          user_id: string
          vehicle_id: string
          silica_insurance: boolean
          extra_o2_tank: boolean
          neural_autopilot_l5: boolean
          extra_eva_suits: number
          preflight_checked: boolean
          postflight_checked: boolean
          quantum_key: string
        }
        Insert: {
          created_at?: string
          dropoff_hangar_id: string
          end_sol: number
          id?: string
          pickup_hangar_id: string
          start_sol: number
          status?: string
          total_credits: number
          user_id: string
          vehicle_id: string
          silica_insurance?: boolean
          extra_o2_tank?: boolean
          neural_autopilot_l5?: boolean
          extra_eva_suits?: number
          preflight_checked?: boolean
          postflight_checked?: boolean
          quantum_key?: string
        }
        Update: {
          created_at?: string
          dropoff_hangar_id?: string
          end_sol?: number
          id?: string
          pickup_hangar_id?: string
          start_sol?: number
          status?: string
          total_credits?: number
          user_id?: string
          vehicle_id?: string
          silica_insurance?: boolean
          extra_o2_tank?: boolean
          neural_autopilot_l5?: boolean
          extra_eva_suits?: number
          preflight_checked?: boolean
          postflight_checked?: boolean
          quantum_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "rentals_dropoff_hangar_id_fkey"
            columns: ["dropoff_hangar_id"]
            isOneToOne: false
            referencedRelation: "hangars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_pickup_hangar_id_fkey"
            columns: ["pickup_hangar_id"]
            isOneToOne: false
            referencedRelation: "hangars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rentals_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          altitude_km: number
          battery_pct: number
          callsign: string
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at: string
          daily_rate_sol: number
          dust_filter_pct: number
          hangar_id: string | null
          id: string
          lat: number
          lng: number
          name: string
          o2_hours: number
          cabin_pressure_kpa: number
          thruster_integrity: number
          speed_kmh: number
          heat_shield_pct: number
          status: Database["public"]["Enums"]["vehicle_status"]
          updated_at: string
        }
        Insert: {
          altitude_km?: number
          battery_pct?: number
          callsign: string
          category: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string
          daily_rate_sol: number
          dust_filter_pct?: number
          hangar_id?: string | null
          id?: string
          lat?: number
          lng?: number
          name: string
          o2_hours?: number
          cabin_pressure_kpa?: number
          thruster_integrity?: number
          speed_kmh?: number
          heat_shield_pct?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
        }
        Update: {
          altitude_km?: number
          battery_pct?: number
          callsign?: string
          category?: Database["public"]["Enums"]["vehicle_category"]
          created_at?: string
          daily_rate_sol?: number
          dust_filter_pct?: number
          hangar_id?: string | null
          id?: string
          lat?: number
          lng?: number
          name?: string
          o2_hours?: number
          cabin_pressure_kpa?: number
          thruster_integrity?: number
          speed_kmh?: number
          heat_shield_pct?: number
          status?: Database["public"]["Enums"]["vehicle_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_hangar_id_fkey"
            columns: ["hangar_id"]
            isOneToOne: false
            referencedRelation: "hangars"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_events: {
        Row: {
          active: boolean
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          radius_km: number
          sector: string
          severity: number
          wind_speed_kmh: number
          radiation_msv: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          radius_km?: number
          sector: string
          severity?: number
          wind_speed_kmh?: number
          radiation_msv?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          radius_km?: number
          sector?: string
          severity?: number
          wind_speed_kmh?: number
          radiation_msv?: number
        }
        Relationships: []
      }
      maintenance_logs: {
        Row: {
          created_at: string
          credits_cost: number
          id: string
          notes: string | null
          service_type: string
          status: string
          user_id: string | null
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          credits_cost?: number
          id?: string
          notes?: string | null
          service_type: string
          status?: string
          user_id?: string | null
          vehicle_id: string
        }
        Update: {
          created_at?: string
          credits_cost?: number
          id?: string
          notes?: string | null
          service_type?: string
          status?: string
          user_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_sales: {
        Row: {
          battery_condition_pct: number
          callsign: string
          category: Database["public"]["Enums"]["vehicle_category"]
          condition: Database["public"]["Enums"]["sale_condition"]
          created_at: string
          features: string[]
          flight_hours: number
          hangar_id: string | null
          hull_integrity_pct: number
          id: string
          name: string
          price_credits: number
          seller_name: string
          seller_user_id: string | null
          sol_manufactured: number
          status: Database["public"]["Enums"]["sale_status"]
          updated_at: string
          warranty_sols: number
        }
        Insert: {
          battery_condition_pct?: number
          callsign: string
          category: Database["public"]["Enums"]["vehicle_category"]
          condition?: Database["public"]["Enums"]["sale_condition"]
          created_at?: string
          features?: string[]
          flight_hours?: number
          hangar_id?: string | null
          hull_integrity_pct?: number
          id?: string
          name: string
          price_credits: number
          seller_name?: string
          seller_user_id?: string | null
          sol_manufactured?: number
          status?: Database["public"]["Enums"]["sale_status"]
          updated_at?: string
          warranty_sols?: number
        }
        Update: {
          battery_condition_pct?: number
          callsign?: string
          category?: Database["public"]["Enums"]["vehicle_category"]
          condition?: Database["public"]["Enums"]["sale_condition"]
          created_at?: string
          features?: string[]
          flight_hours?: number
          hangar_id?: string | null
          hull_integrity_pct?: number
          id?: string
          name?: string
          price_credits?: number
          seller_name?: string
          seller_user_id?: string | null
          sol_manufactured?: number
          status?: Database["public"]["Enums"]["sale_status"]
          updated_at?: string
          warranty_sols?: number
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_sales_hangar_id_fkey"
            columns: ["hangar_id"]
            isOneToOne: false
            referencedRelation: "hangars"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicle_purchases: {
        Row: {
          buyer_user_id: string
          created_at: string
          id: string
          price_paid_credits: number
          quantum_master_key: string
          sale_id: string
        }
        Insert: {
          buyer_user_id: string
          created_at?: string
          id?: string
          price_paid_credits: number
          quantum_master_key: string
          sale_id: string
        }
        Update: {
          buyer_user_id?: string
          created_at?: string
          id?: string
          price_paid_credits?: number
          quantum_master_key?: string
          sale_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicle_purchases_sale_id_fkey"
            columns: ["sale_id"]
            isOneToOne: false
            referencedRelation: "vehicle_sales"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_routes: {
        Row: {
          altitude_cruise_km: number
          created_at: string
          current_progress_pct: number
          destination_hangar_id: string
          estimated_duration_sols: number
          id: string
          max_mach: number
          origin_hangar_id: string
          rental_id: string | null
          status: string
          updated_at: string
          vehicle_id: string
          waypoints: Json
        }
        Insert: {
          altitude_cruise_km?: number
          created_at?: string
          current_progress_pct?: number
          destination_hangar_id: string
          estimated_duration_sols?: number
          id?: string
          max_mach?: number
          origin_hangar_id: string
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id: string
          waypoints?: Json
        }
        Update: {
          altitude_cruise_km?: number
          created_at?: string
          current_progress_pct?: number
          destination_hangar_id?: string
          estimated_duration_sols?: number
          id?: string
          max_mach?: number
          origin_hangar_id?: string
          rental_id?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string
          waypoints?: Json
        }
        Relationships: [
          {
            foreignKeyName: "flight_routes_destination_hangar_id_fkey"
            columns: ["destination_hangar_id"]
            isOneToOne: false
            referencedRelation: "hangars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_routes_origin_hangar_id_fkey"
            columns: ["origin_hangar_id"]
            isOneToOne: false
            referencedRelation: "hangars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "flight_routes_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      flight_telemetry_logs: {
        Row: {
          altitude_km: number
          battery_pct: number
          cabin_pressure_kpa: number
          dust_filter_pct: number
          heading_deg: number
          id: string
          lat: number
          lng: number
          mach_number: number
          o2_hours: number
          pitch_deg: number
          recorded_at: string
          roll_deg: number
          route_id: string | null
          speed_kmh: number
          vehicle_id: string
        }
        Insert: {
          altitude_km: number
          battery_pct?: number
          cabin_pressure_kpa?: number
          dust_filter_pct?: number
          heading_deg?: number
          id?: string
          lat: number
          lng: number
          mach_number?: number
          o2_hours?: number
          pitch_deg?: number
          recorded_at?: string
          roll_deg?: number
          route_id?: string | null
          speed_kmh: number
          vehicle_id: string
        }
        Update: {
          altitude_km?: number
          battery_pct?: number
          cabin_pressure_kpa?: number
          dust_filter_pct?: number
          heading_deg?: number
          id?: string
          lat?: number
          lng?: number
          mach_number?: number
          o2_hours?: number
          pitch_deg?: number
          recorded_at?: string
          roll_deg?: number
          route_id?: string | null
          speed_kmh?: number
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "flight_telemetry_logs_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_vehicle: {
        Args: {
          _vehicle_id: string
          _pickup: string
          _dropoff: string
          _start_sol: number
          _end_sol: number
          _silica_insurance?: boolean
          _extra_o2_tank?: boolean
          _neural_autopilot_l5?: boolean
          _extra_eva_suits?: number
        }
        Returns: string
      }
      execute_maintenance: {
        Args: {
          _vehicle_id: string
          _service_type: string
          _notes?: string | null
        }
        Returns: Json
      }
      record_flight_telemetry: {
        Args: {
          _vehicle_id: string
          _lat: number
          _lng: number
          _altitude_km: number
          _speed_kmh: number
          _route_id?: string | null
          _mach?: number
          _battery_pct?: number
          _o2_hours?: number
          _dust_filter_pct?: number
        }
        Returns: string
      }
      buy_marketplace_vehicle: {
        Args: {
          _sale_id: string
        }
        Returns: string
      }
    }
    Enums: {
      pilot_license: "atmospheric" | "heavy_cargo" | "orbital"
      vehicle_category: "car_vtol" | "space_truck" | "interplanetary_rocket"
      vehicle_status: "available" | "in_flight" | "maintenance" | "storm_hold"
      sale_condition: "certified_preowned" | "refurbished" | "factory_new"
      sale_status: "available_for_sale" | "reserved" | "sold"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never
