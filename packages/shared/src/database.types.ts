// Hand-written to match `supabase gen types typescript` output until a local Supabase stack is
// available. Regenerate with `pnpm db:types` (overwrites this file).
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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      budgets: {
        Row: {
          category_id: string
          currency: string
          household_id: string
          id: string
          monthly_amount_minor: number
        }
        Insert: {
          category_id: string
          currency?: string
          household_id: string
          id?: string
          monthly_amount_minor: number
        }
        Update: {
          category_id?: string
          currency?: string
          household_id?: string
          id?: string
          monthly_amount_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_household_id_category_id_fkey"
            columns: ["household_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          household_id: string
          icon: string
          id: string
          is_archived: boolean
          name: string
          sort_order: number
        }
        Insert: {
          household_id: string
          icon?: string
          id?: string
          is_archived?: boolean
          name: string
          sort_order?: number
        }
        Update: {
          household_id?: string
          icon?: string
          id?: string
          is_archived?: boolean
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_receipts: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expense_id: string
          file_name: string
          household_id: string
          id: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expense_id: string
          file_name: string
          household_id: string
          id?: string
          mime_type: string
          size_bytes: number
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expense_id?: string
          file_name?: string
          household_id?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_receipts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_receipts_household_id_expense_id_fkey"
            columns: ["household_id", "expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "expense_receipts_household_id_expense_id_fkey"
            columns: ["household_id", "expense_id"]
            isOneToOne: false
            referencedRelation: "expense_list"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "expense_receipts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_minor: number
          category_id: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          description: string
          household_id: string
          id: string
          notes: string | null
          occurred_on: string
          paid_by: string | null
          provider_id: string | null
          recurring_expense_id: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_minor: number
          category_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description: string
          household_id: string
          id?: string
          notes?: string | null
          occurred_on: string
          paid_by?: string | null
          provider_id?: string | null
          recurring_expense_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_minor?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          description?: string
          household_id?: string
          id?: string
          notes?: string | null
          occurred_on?: string
          paid_by?: string | null
          provider_id?: string | null
          recurring_expense_id?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_household_id_category_id_fkey"
            columns: ["household_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_paid_by_fkey"
            columns: ["paid_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          currency: string
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          household_id: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          household_id: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          household_id?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active_household_id: string | null
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          active_household_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          active_household_id?: string | null
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_household_fk"
            columns: ["active_household_id", "id"]
            isOneToOne: false
            referencedRelation: "household_members"
            referencedColumns: ["household_id", "user_id"]
          },
        ]
      }
      providers: {
        Row: {
          area: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          household_id: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          rating: number | null
          trade: string
          updated_at: string
          updated_by: string | null
          whatsapp: string | null
        }
        Insert: {
          area?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          household_id: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          trade?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Update: {
          area?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          household_id?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          rating?: number | null
          trade?: string
          updated_at?: string
          updated_by?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "providers_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_expenses: {
        Row: {
          amount_minor: number
          category_id: string
          created_at: string
          created_by: string | null
          currency: string
          description: string
          frequency: string
          household_id: string
          id: string
          interval_count: number
          is_active: boolean
          next_due_on: string
          paid_by: string | null
          provider_id: string | null
          start_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_minor: number
          category_id: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description: string
          frequency: string
          household_id: string
          id?: string
          interval_count?: number
          is_active?: boolean
          next_due_on: string
          paid_by?: string | null
          provider_id?: string | null
          start_on: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_minor?: number
          category_id?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          frequency?: string
          household_id?: string
          id?: string
          interval_count?: number
          is_active?: boolean
          next_due_on?: string
          paid_by?: string | null
          provider_id?: string | null
          start_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_household_id_category_id_fkey"
            columns: ["household_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "recurring_expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      expense_list: {
        Row: {
          amount_minor: number | null
          category_id: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          description: string | null
          household_id: string | null
          id: string | null
          notes: string | null
          occurred_on: string | null
          paid_by: string | null
          provider_id: string | null
          receipt_count: number | null
          recurring_expense_id: string | null
          search_text: string | null
          status: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_household_id_category_id_fkey"
            columns: ["household_id", "category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["household_id", "id"]
          },
          {
            foreignKeyName: "expenses_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_household: {
        Args: { household_name: string }
        Returns: {
          created_at: string
          currency: string
          id: string
          name: string
          timezone: string
        }
        SetofOptions: {
          from: "*"
          to: "households"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      expense_category_totals: {
        Args: { p_from: string; p_household_id: string; p_to: string }
        Returns: {
          category_id: string
          expense_count: number
          total_minor: number
        }[]
      }
      expense_provider_totals: {
        Args: { p_from?: string; p_household_id: string; p_to?: string }
        Returns: {
          expense_count: number
          provider_id: string
          total_minor: number
        }[]
      }
      generate_due_recurring_expenses: {
        Args: { p_household_id: string }
        Returns: number
      }
      generate_recurring_expenses: {
        Args: { p_household_id?: string; p_max_per_bill?: number; p_today?: string }
        Returns: number
      }
      invite_accept: {
        Args: { p_preview: boolean; p_token_hash: string; p_user_id: string }
        Returns: {
          already_member: boolean
          email: string
          email_matches: boolean
          household_id: string
          household_name: string
          inviter_name: string
        }[]
      }
      invite_revoke: {
        Args: { p_invite_id: string; p_user_id: string }
        Returns: undefined
      }
      invite_upsert: {
        Args: {
          p_email: string
          p_household_id: string
          p_invited_by: string
          p_token_hash: string
        }
        Returns: {
          email: string
          expires_at: string
          household_name: string
          invite_id: string
          inviter_name: string
          resent: boolean
        }[]
      }
      is_household_member: { Args: { hid: string }; Returns: boolean }
      is_member_of: { Args: { hid: string; uid: string }; Returns: boolean }
      leave_household: {
        Args: {
          p_delete_if_last: boolean
          p_household_id: string
          p_user_id: string
        }
        Returns: string
      }
      reorder_expense_categories: {
        Args: { p_household_id: string; p_ids: string[] }
        Returns: undefined
      }
      set_budget: {
        Args: {
          p_amount_minor: number | null
          p_category_id: string
          p_household_id: string
        }
        Returns: undefined
      }
      shares_household_with: {
        Args: { other_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const
