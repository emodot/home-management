// Hand-written to match `supabase gen types typescript` output until a local Supabase stack is
// available. Regenerate with `pnpm db:types` (overwrites this file).
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5'
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          changes: Json | null
          created_at: string
          entity_id: string
          entity_type: string
          household_id: string
          id: number
          summary: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id: string
          entity_type: string
          household_id: string
          id?: never
          summary: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          changes?: Json | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          household_id?: string
          id?: never
          summary?: string
        }
        Relationships: [
          {
            foreignKeyName: 'activity_log_actor_id_fkey'
            columns: ['actor_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'activity_log_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      admin_actions: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          details: Json | null
          id: number
          target_id: string
          target_type: string
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          target_id: string
          target_type: string
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          details?: Json | null
          id?: never
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          category_id: string
          currency: string
          household_id: string
          id: string
          monthly_amount_minor: number | null
          starts_on: string
        }
        Insert: {
          category_id: string
          currency?: string
          household_id: string
          id?: string
          monthly_amount_minor?: number | null
          starts_on: string
        }
        Update: {
          category_id?: string
          currency?: string
          household_id?: string
          id?: string
          monthly_amount_minor?: number | null
          starts_on?: string
        }
        Relationships: [
          {
            foreignKeyName: 'budgets_household_id_category_id_fkey'
            columns: ['household_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'expense_categories'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'budgets_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
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
          parent_id: string | null
          sort_order: number
        }
        Insert: {
          household_id: string
          icon?: string
          id?: string
          is_archived?: boolean
          name: string
          parent_id?: string | null
          sort_order?: number
        }
        Update: {
          household_id?: string
          icon?: string
          id?: string
          is_archived?: boolean
          name?: string
          parent_id?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: 'expense_categories_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
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
            foreignKeyName: 'expense_receipts_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expense_receipts_household_id_expense_id_fkey'
            columns: ['household_id', 'expense_id']
            isOneToOne: false
            referencedRelation: 'expenses'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'expense_receipts_household_id_expense_id_fkey'
            columns: ['household_id', 'expense_id']
            isOneToOne: false
            referencedRelation: 'expense_list'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'expense_receipts_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      expenses: {
        Row: {
          amount_minor: number
          budget_month: string
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
          task_completion_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_minor: number
          budget_month?: string
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
          task_completion_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_minor?: number
          budget_month?: string
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
          task_completion_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_created_by_fkey'
            columns: ['created_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_household_id_category_id_fkey'
            columns: ['household_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'expense_categories'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'expenses_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_paid_by_fkey'
            columns: ['paid_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'expenses_updated_by_fkey'
            columns: ['updated_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      gas_refills: {
        Row: {
          amount_minor: number
          created_at: string
          created_by: string | null
          cylinder_kg: number
          expense_id: string | null
          household_id: string
          id: string
          provider_id: string | null
          refilled_on: string
        }
        Insert: {
          amount_minor: number
          created_at?: string
          created_by?: string | null
          cylinder_kg: number
          expense_id?: string | null
          household_id: string
          id?: string
          provider_id?: string | null
          refilled_on: string
        }
        Update: {
          amount_minor?: number
          created_at?: string
          created_by?: string | null
          cylinder_kg?: number
          expense_id?: string | null
          household_id?: string
          id?: string
          provider_id?: string | null
          refilled_on?: string
        }
        Relationships: [
          {
            foreignKeyName: 'gas_refills_household_id_provider_id_fkey'
            columns: ['household_id', 'provider_id']
            isOneToOne: false
            referencedRelation: 'providers'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      gas_reminders: {
        Row: {
          household_id: string
          task_id: string
        }
        Insert: {
          household_id: string
          task_id: string
        }
        Update: {
          household_id?: string
          task_id?: string
        }
        Relationships: []
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'household_members_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'household_members_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          currency: string
          id: string
          meal_slots: string[]
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          meal_slots?: string[]
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          meal_slots?: string[]
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      income: {
        Row: {
          amount_minor: number
          budget_month: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          household_id: string
          id: string
          notes: string | null
          received_by: string | null
          received_on: string
          recurring_income_id: string | null
          source: string
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_minor: number
          budget_month?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          household_id: string
          id?: string
          notes?: string | null
          received_by?: string | null
          received_on: string
          recurring_income_id?: string | null
          source: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_minor?: number
          budget_month?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          household_id?: string
          id?: string
          notes?: string | null
          received_by?: string | null
          received_on?: string
          recurring_income_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'income_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string | null
          expires_at: string
          household_id: string
          id: string
          invited_by: string | null
          revoked_at: string | null
          role: string
          token_hash: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          household_id: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: string
          token_hash: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          household_id?: string
          id?: string
          invited_by?: string | null
          revoked_at?: string | null
          role?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: 'invites_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'invites_invited_by_fkey'
            columns: ['invited_by']
            isOneToOne: false
            referencedRelation: 'profiles'
            referencedColumns: ['id']
          },
        ]
      }
      item_prices: {
        Row: {
          bought_on: string
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          item_id: string
          price_minor: number
          quantity: number
          store_tag: string | null
          trip_id: string
          unit: string
          unit_price_minor: number
        }
        Insert: {
          bought_on: string
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          item_id: string
          price_minor: number
          quantity: number
          store_tag?: string | null
          trip_id: string
          unit: string
          unit_price_minor?: number
        }
        Update: {
          bought_on?: string
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          item_id?: string
          price_minor?: number
          quantity?: number
          store_tag?: string | null
          trip_id?: string
          unit?: string
          unit_price_minor?: number
        }
        Relationships: [
          {
            foreignKeyName: 'item_prices_household_id_item_id_fkey'
            columns: ['household_id', 'item_id']
            isOneToOne: false
            referencedRelation: 'kitchen_items'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'item_prices_household_id_trip_id_fkey'
            columns: ['household_id', 'trip_id']
            isOneToOne: false
            referencedRelation: 'shopping_trips'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      kitchen_items: {
        Row: {
          created_at: string
          created_by: string | null
          default_store_tag: string | null
          default_unit: string
          household_id: string
          id: string
          name: string
          normalized_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_store_tag?: string | null
          default_unit?: string
          household_id: string
          id?: string
          name: string
          normalized_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_store_tag?: string | null
          default_unit?: string
          household_id?: string
          id?: string
          name?: string
          normalized_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      kitchen_item_units: {
        Row: {
          created_at: string
          created_by: string | null
          factor: number
          household_id: string
          id: string
          item_id: string
          to_unit: string
          unit: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          factor: number
          household_id: string
          id?: string
          item_id: string
          to_unit: string
          unit: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          factor?: number
          household_id?: string
          id?: string
          item_id?: string
          to_unit?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: 'kitchen_item_units_household_id_item_id_fkey'
            columns: ['household_id', 'item_id']
            isOneToOne: false
            referencedRelation: 'kitchen_items'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      meal_plan_entries: {
        Row: {
          cooked_at: string | null
          created_at: string
          created_by: string | null
          date: string
          household_id: string
          id: string
          leftover_of: string | null
          plan_id: string
          recipe_id: string | null
          servings: number | null
          slot: string
          title: string
        }
        Insert: {
          cooked_at?: string | null
          created_at?: string
          created_by?: string | null
          date: string
          household_id: string
          id?: string
          leftover_of?: string | null
          plan_id: string
          recipe_id?: string | null
          servings?: number | null
          slot: string
          title: string
        }
        Update: {
          cooked_at?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          household_id?: string
          id?: string
          leftover_of?: string | null
          plan_id?: string
          recipe_id?: string | null
          servings?: number | null
          slot?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: 'meal_plan_entries_household_id_plan_id_fkey'
            columns: ['household_id', 'plan_id']
            isOneToOne: false
            referencedRelation: 'meal_plans'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'meal_plan_entries_household_id_recipe_id_fkey'
            columns: ['household_id', 'recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      meal_plans: {
        Row: {
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          week_start?: string
        }
        Relationships: []
      }
      pantry_items: {
        Row: {
          created_at: string
          created_by: string | null
          expires_on: string | null
          household_id: string
          id: string
          item_id: string
          location: string
          low_stock_threshold: number | null
          quantity: number
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          household_id: string
          id?: string
          item_id: string
          location?: string
          low_stock_threshold?: number | null
          quantity?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_on?: string | null
          household_id?: string
          id?: string
          item_id?: string
          location?: string
          low_stock_threshold?: number | null
          quantity?: number
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'pantry_items_household_id_item_id_fkey'
            columns: ['household_id', 'item_id']
            isOneToOne: false
            referencedRelation: 'kitchen_items'
            referencedColumns: ['household_id', 'id']
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
            foreignKeyName: 'profiles_active_household_fk'
            columns: ['active_household_id', 'id']
            isOneToOne: false
            referencedRelation: 'household_members'
            referencedColumns: ['household_id', 'user_id']
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
            foreignKeyName: 'providers_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
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
          for_next_month: boolean
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
          for_next_month?: boolean
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
          for_next_month?: boolean
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
            foreignKeyName: 'recurring_expenses_household_id_category_id_fkey'
            columns: ['household_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'expense_categories'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'recurring_expenses_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
      recurring_income: {
        Row: {
          amount_minor: number
          created_at: string
          created_by: string | null
          currency: string
          for_next_month: boolean
          frequency: string
          household_id: string
          id: string
          interval_count: number
          is_active: boolean
          next_due_on: string
          received_by: string | null
          source: string
          start_on: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          amount_minor: number
          created_at?: string
          created_by?: string | null
          currency?: string
          for_next_month?: boolean
          frequency: string
          household_id: string
          id?: string
          interval_count?: number
          is_active?: boolean
          next_due_on: string
          received_by?: string | null
          source: string
          start_on: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          amount_minor?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          for_next_month?: boolean
          frequency?: string
          household_id?: string
          id?: string
          interval_count?: number
          is_active?: boolean
          next_due_on?: string
          received_by?: string | null
          source?: string
          start_on?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      reminder_logs: {
        Row: {
          due_on: string
          household_id: string
          id: string
          kind: string
          recipient_user_id: string
          sent_at: string
          task_id: string
        }
        Insert: {
          due_on: string
          household_id: string
          id?: string
          kind: string
          recipient_user_id: string
          sent_at?: string
          task_id: string
        }
        Update: {
          due_on?: string
          household_id?: string
          id?: string
          kind?: string
          recipient_user_id?: string
          sent_at?: string
          task_id?: string
        }
        Relationships: []
      }
      recipe_ingredients: {
        Row: {
          household_id: string
          id: string
          is_optional: boolean
          item_id: string
          note: string | null
          position: number
          quantity: number | null
          recipe_id: string
          unit: string
        }
        Insert: {
          household_id: string
          id?: string
          is_optional?: boolean
          item_id: string
          note?: string | null
          position: number
          quantity?: number | null
          recipe_id: string
          unit?: string
        }
        Update: {
          household_id?: string
          id?: string
          is_optional?: boolean
          item_id?: string
          note?: string | null
          position?: number
          quantity?: number | null
          recipe_id?: string
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_ingredients_household_id_item_id_fkey'
            columns: ['household_id', 'item_id']
            isOneToOne: false
            referencedRelation: 'kitchen_items'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'recipe_ingredients_household_id_recipe_id_fkey'
            columns: ['household_id', 'recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      recipe_steps: {
        Row: {
          body: string
          household_id: string
          id: string
          position: number
          recipe_id: string
        }
        Insert: {
          body: string
          household_id: string
          id?: string
          position: number
          recipe_id: string
        }
        Update: {
          body?: string
          household_id?: string
          id?: string
          position?: number
          recipe_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recipe_steps_household_id_recipe_id_fkey'
            columns: ['household_id', 'recipe_id']
            isOneToOne: false
            referencedRelation: 'recipes'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      recipes: {
        Row: {
          cook_minutes: number | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          notes: string | null
          photo_path: string | null
          prep_minutes: number | null
          servings: number
          tags: string[]
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cook_minutes?: number | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          notes?: string | null
          photo_path?: string | null
          prep_minutes?: number | null
          servings?: number
          tags?: string[]
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cook_minutes?: number | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          notes?: string | null
          photo_path?: string | null
          prep_minutes?: number | null
          servings?: number
          tags?: string[]
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shopping_list_items: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          created_at: string
          created_by: string | null
          household_id: string
          id: string
          is_checked: boolean
          item_id: string
          notes: string | null
          price_paid_minor: number | null
          quantity: number
          source: string
          source_ref: string | null
          store_tag: string | null
          unit: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by?: string | null
          household_id: string
          id?: string
          is_checked?: boolean
          item_id: string
          notes?: string | null
          price_paid_minor?: number | null
          quantity?: number
          source?: string
          source_ref?: string | null
          store_tag?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          created_at?: string
          created_by?: string | null
          household_id?: string
          id?: string
          is_checked?: boolean
          item_id?: string
          notes?: string | null
          price_paid_minor?: number | null
          quantity?: number
          source?: string
          source_ref?: string | null
          store_tag?: string | null
          unit?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'shopping_list_items_household_id_item_id_fkey'
            columns: ['household_id', 'item_id']
            isOneToOne: false
            referencedRelation: 'kitchen_items'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      shopping_trips: {
        Row: {
          bought_on: string
          created_at: string
          created_by: string | null
          expense_id: string | null
          household_id: string
          id: string
          item_count: number
          store_tag: string | null
          total_minor: number
        }
        Insert: {
          bought_on: string
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          household_id: string
          id?: string
          item_count: number
          store_tag?: string | null
          total_minor: number
        }
        Update: {
          bought_on?: string
          created_at?: string
          created_by?: string | null
          expense_id?: string | null
          household_id?: string
          id?: string
          item_count?: number
          store_tag?: string | null
          total_minor?: number
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          completed_by: string | null
          completed_on: string
          created_at: string
          due_on: string
          household_id: string
          id: string
          notes: string | null
          task_id: string
        }
        Insert: {
          completed_by?: string | null
          completed_on: string
          created_at?: string
          due_on: string
          household_id: string
          id?: string
          notes?: string | null
          task_id: string
        }
        Update: {
          completed_by?: string | null
          completed_on?: string
          created_at?: string
          due_on?: string
          household_id?: string
          id?: string
          notes?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'task_completions_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'task_completions_household_id_task_id_fkey'
            columns: ['household_id', 'task_id']
            isOneToOne: false
            referencedRelation: 'tasks'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          default_category_id: string | null
          deleted_at: string | null
          description: string | null
          frequency: string | null
          household_id: string
          id: string
          interval_count: number
          is_active: boolean
          next_due_on: string
          provider_id: string | null
          reminder_days_before: number
          schedule_type: string
          start_on: string
          title: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          default_category_id?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency?: string | null
          household_id: string
          id?: string
          interval_count?: number
          is_active?: boolean
          next_due_on: string
          provider_id?: string | null
          reminder_days_before?: number
          schedule_type: string
          start_on: string
          title: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          default_category_id?: string | null
          deleted_at?: string | null
          description?: string | null
          frequency?: string | null
          household_id?: string
          id?: string
          interval_count?: number
          is_active?: boolean
          next_due_on?: string
          provider_id?: string | null
          reminder_days_before?: number
          schedule_type?: string
          start_on?: string
          title?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'tasks_household_id_default_category_id_fkey'
            columns: ['household_id', 'default_category_id']
            isOneToOne: false
            referencedRelation: 'expense_categories'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'tasks_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'tasks_household_id_provider_id_fkey'
            columns: ['household_id', 'provider_id']
            isOneToOne: false
            referencedRelation: 'providers'
            referencedColumns: ['household_id', 'id']
          },
        ]
      }
      user_onboarding: {
        Row: {
          key: string
          last_step: number | null
          status: string
          updated_at: string
          user_id: string
          version: number
        }
        Insert: {
          key: string
          last_step?: number | null
          status: string
          updated_at?: string
          user_id: string
          version?: number
        }
        Update: {
          key?: string
          last_step?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          version?: number
        }
        Relationships: []
      }
    }
    Views: {
      expense_list: {
        Row: {
          amount_minor: number | null
          budget_month: string | null
          category_id: string | null
          category_parent_id: string | null
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
          task_completion_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Relationships: [
          {
            foreignKeyName: 'expenses_household_id_category_id_fkey'
            columns: ['household_id', 'category_id']
            isOneToOne: false
            referencedRelation: 'expense_categories'
            referencedColumns: ['household_id', 'id']
          },
          {
            foreignKeyName: 'expenses_household_id_fkey'
            columns: ['household_id']
            isOneToOne: false
            referencedRelation: 'households'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Functions: {
      admin_create_household: {
        Args: { p_name: string }
        Returns: {
          created_at: string
          currency: string
          id: string
          name: string
          timezone: string
        }
        SetofOptions: {
          from: '*'
          to: 'households'
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_invite: {
        Args: { p_email: string; p_household_id: string; p_token_hash: string }
        Returns: {
          email: string | null
          expires_at: string
          household_name: string
          invite_id: string
        }[]
      }
      admin_delete_household: {
        Args: { p_household_id: string }
        Returns: undefined
      }
      admin_find_user_by_email: {
        Args: { p_email: string }
        Returns: { id: string; is_admin: boolean }[]
      }
      admin_get_household: {
        Args: { p_household_id: string }
        Returns: Json
      }
      admin_get_user: {
        Args: { p_user_id: string }
        Returns: Json
      }
      admin_grant: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_list_admins: {
        Args: never
        Returns: {
          admin_since: string
          email: string
          full_name: string | null
          household_count: number
          id: string
          last_sign_in_at: string | null
        }[]
      }
      admin_list_households: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          created_at: string
          expense_count: number
          id: string
          last_activity_at: string | null
          member_count: number
          name: string
          task_count: number
          total_count: number
        }[]
      }
      admin_list_users: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string }
        Returns: {
          avatar_url: string | null
          banned_until: string | null
          created_at: string
          email: string
          full_name: string | null
          household_count: number
          id: string
          is_admin: boolean
          last_sign_in_at: string | null
          total_count: number
        }[]
      }
      admin_log: {
        Args: {
          p_action: string
          p_admin_id: string
          p_details?: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      admin_overview: {
        Args: never
        Returns: Json
      }
      admin_set_member_role: {
        Args: { p_household_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      admin_rename_household: {
        Args: { p_household_id: string; p_name: string }
        Returns: undefined
      }
      admin_revoke: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      claim_task_reminders: {
        Args: { p_today?: string }
        Returns: {
          assigned_to_recipient: boolean
          due_on: string
          household_id: string
          household_name: string
          kind: string
          log_id: string
          provider_name: string | null
          provider_phone: string | null
          recipient_email: string
          recipient_name: string
          recipient_user_id: string
          task_id: string
          task_title: string
        }[]
      }
      budgets_for_month: {
        Args: { p_household_id: string; p_month: string }
        Returns: {
          category_id: string
          currency: string
          household_id: string
          id: string
          monthly_amount_minor: number | null
          starts_on: string
        }[]
        SetofOptions: {
          from: '*'
          to: 'budgets'
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_task: {
        Args: { p_completed_on?: string; p_notes?: string; p_task_id: string }
        Returns: string
      }
      delete_expired_invites: { Args: { p_before?: string }; Returns: number }
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
      income_totals: {
        Args: { p_from: string; p_household_id: string; p_to: string }
        Returns: {
          entry_count: number
          month: string
          total_minor: number
        }[]
      }
      is_household_admin: { Args: { hid: string }; Returns: boolean }
      generate_due_recurring_income: {
        Args: { p_household_id: string }
        Returns: number
      }
      generate_due_recurring_expenses: {
        Args: { p_household_id: string }
        Returns: number
      }
      generate_recurring_expenses: {
        Args: { p_household_id?: string; p_max_per_bill?: number; p_today?: string }
        Returns: number
      }
      is_kitchen_unit: {
        Args: { unit: string }
        Returns: boolean
      }
      finish_shopping_trip: {
        Args: {
          p_category_id: string
          p_description: string
          p_entries: Json
          p_household_id: string
          p_notes?: string
          p_paid_by: string
          p_paid_on: string
          p_store?: string
          p_total_minor: number
        }
        Returns: Json
      }
      kitchen_convert:
        | {
            Args: { p_from: string; p_quantity: number; p_to: string }
            Returns: number
          }
        | {
            Args: { p_from: string; p_item_id: string; p_quantity: number; p_to: string }
            Returns: number
          }
      add_meal: {
        Args: {
          p_date: string
          p_household_id: string
          p_leftovers?: Json
          p_recipe_id: string | null
          p_servings: number | null
          p_slot: string
          p_title: string | null
        }
        Returns: string
      }
      cook_recipe: {
        Args: { p_household_id: string; p_lines: Json; p_meal_id?: string }
        Returns: Json
      }
      uncook: {
        Args: { p_changes: Json; p_household_id: string; p_meal_id?: string }
        Returns: undefined
      }
      copy_meal_week: {
        Args: { p_from: string; p_household_id: string; p_to: string }
        Returns: number
      }
      set_meal_leftovers: {
        Args: { p_entry_id: string; p_leftovers: Json }
        Returns: undefined
      }
      set_meal_slots: {
        Args: { p_household_id: string; p_slots: string[] }
        Returns: undefined
      }
      add_plan_to_list: {
        Args: { p_household_id: string; p_lines: Json; p_week_start: string }
        Returns: Json
      }
      add_recipe_to_list: {
        Args: { p_household_id: string; p_lines: Json; p_recipe_id: string }
        Returns: Json
      }
      save_recipe: {
        Args: {
          p_cook_minutes: number | null
          p_household_id: string
          p_ingredients: Json
          p_notes: string | null
          p_prep_minutes: number | null
          p_recipe_id: string | null
          p_servings: number
          p_steps: Json
          p_tags: string[]
          p_title: string
        }
        Returns: string
      }
      merge_kitchen_items: {
        Args: { p_keep: string; p_merge: string }
        Returns: undefined
      }
      log_gas_refill: {
        Args: {
          p_amount_minor: number
          p_cylinder_kg: number
          p_household_id: string
          p_paid_by: string
          p_provider_id?: string
          p_refilled_on: string
          p_reminder_on?: string
        }
        Returns: Json
      }
      remove_gas_refill: {
        Args: { p_refill_id: string }
        Returns: undefined
      }
      is_household_admin_of: {
        Args: { hid: string; uid: string }
        Returns: boolean
      }
      is_app_admin: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      invite_accept: {
        Args: { p_preview: boolean; p_token_hash: string; p_user_id: string }
        Returns: {
          already_member: boolean
          household_id: string
          household_name: string
          inviter_name: string
        }[]
      }
      invite_revoke: {
        Args: { p_invite_id: string; p_user_id: string }
        Returns: undefined
      }
      invite_rotate: {
        Args: { p_invite_id: string; p_token_hash: string; p_user_id: string }
        Returns: {
          email: string | null
          expires_at: string
          household_name: string
          invite_id: string
          inviter_name: string
          resent: boolean
        }[]
      }
      invite_upsert: {
        Args: {
          p_email: string
          p_household_id: string
          p_invited_by: string
          p_token_hash: string
        }
        Returns: {
          email: string | null
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
        Args: { p_household_id: string; p_user_id: string }
        Returns: string
      }
      purge_deleted_rows: { Args: { p_before?: string }; Returns: Json }
      release_task_reminder: { Args: { p_log_id: string }; Returns: undefined }
      reorder_expense_categories: {
        Args: { p_household_id: string; p_ids: string[] }
        Returns: undefined
      }
      set_budget:
        | {
            Args: {
              p_amount_minor: number | null
              p_category_id: string
              p_household_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_amount_minor: number | null
              p_category_id: string
              p_household_id: string
              p_month: string
            }
            Returns: undefined
          }
      undo_task_completion: {
        Args: { p_completion_id: string }
        Returns: undefined
      }
      shares_household_with: {
        Args: { other_user_id: string }
        Returns: boolean
      }
      mark_onboarding: {
        Args: { p_key: string; p_version: number; p_status: string; p_last_step?: number | null }
        Returns: undefined
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
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
