export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
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
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          martian_credits?: number
          pilot_license?: Database["public"]["Enums"]["pilot_license"]
          space_credential_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          martian_credits?: number
          pilot_license?: Database["public"]["Enums"]["pilot_license"]
          space_credential_id?: string | null
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
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      book_vehicle: {
        Args: {
          _dropoff: string
          _end_sol: number
          _pickup: string
          _start_sol: number
          _vehicle_id: string
        }
        Returns: string
      }
    }
    Enums: {
      pilot_license: "atmospheric" | "heavy_cargo" | "orbital"
      vehicle_category: "car_vtol" | "space_truck" | "interplanetary_rocket"
      vehicle_status: "available" | "in_flight" | "maintenance" | "storm_hold"
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

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      pilot_license: ["atmospheric", "heavy_cargo", "orbital"],
      vehicle_category: ["car_vtol", "space_truck", "interplanetary_rocket"],
      vehicle_status: ["available", "in_flight", "maintenance", "storm_hold"],
    },
  },
} as const
