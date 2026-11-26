
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "balance_notices": {
                  Row: {
                    "by_seat": string | null,"cause_category": string,"cause_kind": string,"cause_title": string | null,"created_at": string,"delta": number,"dismissed_at": string | null,"expense_id": string | null,"id": string,"seat_id": string,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "by_seat"?: string | null,"cause_category": string,"cause_kind": string,"cause_title"?: string | null,"created_at"?: string,"delta": number,"dismissed_at"?: string | null,"expense_id"?: string | null,"id": string,"seat_id": string,"trip_id": string
                  }
                  Update: {
                    "by_seat"?: string | null,"cause_category"?: string,"cause_kind"?: string,"cause_title"?: string | null,"created_at"?: string,"delta"?: number,"dismissed_at"?: string | null,"expense_id"?: string | null,"id"?: string,"seat_id"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "balance_notices_by_seat_fkey"
      columns: ["by_seat"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "balance_notices_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "balance_notices_seat_id_fkey"
      columns: ["seat_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "balance_notices_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_changes": {
                  Row: {
                    "at": string,"by_seat": string,"expense_id": string,"id": number,"kind": string,"money_version": number,"summary": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "at"?: string,"by_seat": string,"expense_id": string,"id"?: number,"kind": string,"money_version": number,"summary"?: string | null
                  }
                  Update: {
                    "at"?: string,"by_seat"?: string,"expense_id"?: string,"id"?: number,"kind"?: string,"money_version"?: number,"summary"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_changes_by_seat_fkey"
      columns: ["by_seat"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_changes_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_payers": {
                  Row: {
                    "amount": number,"base_amount": number | null,"expense_id": string,"position": number,"seat_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"base_amount"?: number | null,"expense_id": string,"position"?: number,"seat_id": string
                  }
                  Update: {
                    "amount"?: number,"base_amount"?: number | null,"expense_id"?: string,"position"?: number,"seat_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_payers_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_payers_seat_id_fkey"
      columns: ["seat_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    }
                  ]
                },"expense_shares": {
                  Row: {
                    "amount": number,"base_amount": number | null,"expense_id": string,"position": number,"seat_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"base_amount"?: number | null,"expense_id": string,"position"?: number,"seat_id": string
                  }
                  Update: {
                    "amount"?: number,"base_amount"?: number | null,"expense_id"?: string,"position"?: number,"seat_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expense_shares_expense_id_fkey"
      columns: ["expense_id"]
isOneToOne: false
      referencedRelation: "expenses"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expense_shares_seat_id_fkey"
      columns: ["seat_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    }
                  ]
                },"expenses": {
                  Row: {
                    "amount": number | null,"base_amount": number | null,"category": string,"created_at": string,"created_by": string,"currency": string | null,"fx_rate": number | null,"fx_source": string | null,"id": string,"money_version": number,"notes": string | null,"occurred_at": string,"receipt_paths": (string)[],"split_method": Database["public"]['Enums']["split_method"] | null,"status": Database["public"]['Enums']["expense_status"],"title": string | null,"trip_id": string,"type": Database["public"]['Enums']["expense_type"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount"?: number | null,"base_amount"?: number | null,"category"?: string,"created_at"?: string,"created_by": string,"currency"?: string | null,"fx_rate"?: number | null,"fx_source"?: string | null,"id"?: string,"money_version"?: number,"notes"?: string | null,"occurred_at": string,"receipt_paths"?: (string)[],"split_method"?: Database["public"]['Enums']["split_method"] | null,"status": Database["public"]['Enums']["expense_status"],"title"?: string | null,"trip_id": string,"type"?: Database["public"]['Enums']["expense_type"],"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number | null,"base_amount"?: number | null,"category"?: string,"created_at"?: string,"created_by"?: string,"currency"?: string | null,"fx_rate"?: number | null,"fx_source"?: string | null,"id"?: string,"money_version"?: number,"notes"?: string | null,"occurred_at"?: string,"receipt_paths"?: (string)[],"split_method"?: Database["public"]['Enums']["split_method"] | null,"status"?: Database["public"]['Enums']["expense_status"],"title"?: string | null,"trip_id"?: string,"type"?: Database["public"]['Enums']["expense_type"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "expenses_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "expenses_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"held_changes": {
                  Row: {
                    "base_version": number | null,"by_seat": string,"created_at": string,"expense_id": string,"id": string,"kind": string,"proposed": NonNullable<Json>,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "base_version"?: number | null,"by_seat": string,"created_at"?: string,"expense_id": string,"id": string,"kind": string,"proposed": NonNullable<Json>,"trip_id": string
                  }
                  Update: {
                    "base_version"?: number | null,"by_seat"?: string,"created_at"?: string,"expense_id"?: string,"id"?: string,"kind"?: string,"proposed"?: NonNullable<Json>,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "held_changes_by_seat_fkey"
      columns: ["by_seat"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "held_changes_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"payout_handles": {
                  Row: {
                    "handles": NonNullable<Json>,"seat_id": string,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "handles"?: NonNullable<Json>,"seat_id": string,"trip_id": string,"updated_at"?: string
                  }
                  Update: {
                    "handles"?: NonNullable<Json>,"seat_id"?: string,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "payout_handles_seat_id_fkey"
      columns: ["seat_id"]
isOneToOne: true
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payout_handles_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"plan_snapshots": {
                  Row: {
                    "frozen_at": string,"ledger_balances": NonNullable<Json>,"transfers": NonNullable<Json>,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "frozen_at"?: string,"ledger_balances": NonNullable<Json>,"transfers": NonNullable<Json>,"trip_id": string
                  }
                  Update: {
                    "frozen_at"?: string,"ledger_balances"?: NonNullable<Json>,"transfers"?: NonNullable<Json>,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "plan_snapshots_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: true
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"seats": {
                  Row: {
                    "created_at": string,"created_by": string | null,"default_excluded": boolean,"display_name": string,"holder_seat_id": string | null,"id": string,"invite_token_hash": string | null,"link_kind": Database["public"]['Enums']["link_kind"],"pending_kind": Database["public"]['Enums']["link_kind"] | null,"pending_principal_id": string | null,"pending_requested_at": string | null,"position": number,"principal_id": string | null,"role": Database["public"]['Enums']["seat_role"],"status": Database["public"]['Enums']["seat_status"],"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"default_excluded"?: boolean,"display_name": string,"holder_seat_id"?: string | null,"id"?: string,"invite_token_hash"?: string | null,"link_kind"?: Database["public"]['Enums']["link_kind"],"pending_kind"?: Database["public"]['Enums']["link_kind"] | null,"pending_principal_id"?: string | null,"pending_requested_at"?: string | null,"position"?: number,"principal_id"?: string | null,"role"?: Database["public"]['Enums']["seat_role"],"status"?: Database["public"]['Enums']["seat_status"],"trip_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"default_excluded"?: boolean,"display_name"?: string,"holder_seat_id"?: string | null,"id"?: string,"invite_token_hash"?: string | null,"link_kind"?: Database["public"]['Enums']["link_kind"],"pending_kind"?: Database["public"]['Enums']["link_kind"] | null,"pending_principal_id"?: string | null,"pending_requested_at"?: string | null,"position"?: number,"principal_id"?: string | null,"role"?: Database["public"]['Enums']["seat_role"],"status"?: Database["public"]['Enums']["seat_status"],"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "seats_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "seats_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"settlements": {
                  Row: {
                    "amount": number,"base_amount": number,"currency": string,"from_seat": string,"id": string,"method": string,"note": string | null,"recorded_at": string,"recorded_by": string,"resolved_at": string | null,"resolved_by": string | null,"status": Database["public"]['Enums']["settlement_status"],"to_seat": string,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount": number,"base_amount": number,"currency": string,"from_seat": string,"id"?: string,"method": string,"note"?: string | null,"recorded_at"?: string,"recorded_by": string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status": Database["public"]['Enums']["settlement_status"],"to_seat": string,"trip_id": string
                  }
                  Update: {
                    "amount"?: number,"base_amount"?: number,"currency"?: string,"from_seat"?: string,"id"?: string,"method"?: string,"note"?: string | null,"recorded_at"?: string,"recorded_by"?: string,"resolved_at"?: string | null,"resolved_by"?: string | null,"status"?: Database["public"]['Enums']["settlement_status"],"to_seat"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_from_seat_fkey"
      columns: ["from_seat"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_recorded_by_fkey"
      columns: ["recorded_by"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_resolved_by_fkey"
      columns: ["resolved_by"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_to_seat_fkey"
      columns: ["to_seat"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "settlements_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"share_reviews": {
                  Row: {
                    "note": string | null,"seat_id": string,"status": string,"trip_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "note"?: string | null,"seat_id": string,"status": string,"trip_id": string,"updated_at"?: string
                  }
                  Update: {
                    "note"?: string | null,"seat_id"?: string,"status"?: string,"trip_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "share_reviews_seat_id_fkey"
      columns: ["seat_id"]
isOneToOne: true
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "share_reviews_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"split_groups": {
                  Row: {
                    "created_at": string,"created_by": string,"id": string,"name": string,"seat_ids": (string)[],"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by": string,"id": string,"name": string,"seat_ids": (string)[],"trip_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string,"id"?: string,"name"?: string,"seat_ids"?: (string)[],"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "split_groups_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "split_groups_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: false
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"summary_links": {
                  Row: {
                    "created_at": string,"token": string,"trip_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"token": string,"trip_id": string
                  }
                  Update: {
                    "created_at"?: string,"token"?: string,"trip_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "summary_links_trip_id_fkey"
      columns: ["trip_id"]
isOneToOne: true
      referencedRelation: "trips"
      referencedColumns: ["id"]
    }
                  ]
                },"trips": {
                  Row: {
                    "base_currency": string,"created_at": string,"end_date": string | null,"hub_seat_id": string | null,"id": string,"join_token": string | null,"name": string,"settle_mode": Database["public"]['Enums']["settle_mode"],"start_date": string | null,"status": Database["public"]['Enums']["trip_status"],"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "base_currency": string,"created_at"?: string,"end_date"?: string | null,"hub_seat_id"?: string | null,"id"?: string,"join_token"?: string | null,"name": string,"settle_mode"?: Database["public"]['Enums']["settle_mode"],"start_date"?: string | null,"status"?: Database["public"]['Enums']["trip_status"],"version"?: number
                  }
                  Update: {
                    "base_currency"?: string,"created_at"?: string,"end_date"?: string | null,"hub_seat_id"?: string | null,"id"?: string,"join_token"?: string | null,"name"?: string,"settle_mode"?: Database["public"]['Enums']["settle_mode"],"start_date"?: string | null,"status"?: Database["public"]['Enums']["trip_status"],"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "trips_hub_seat_fk"
      columns: ["hub_seat_id"]
isOneToOne: false
      referencedRelation: "seats"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "approve_seat_claim":
{ Args: { "p_seat": string }; Returns: undefined
                           },
"check_expense_sums":
{ Args: { "p_expense": string }; Returns: undefined
                           },
"claim_seat_with_invite":
{ Args: { "p_token": string }; Returns: {
              "seat_id": string,"trip_id": string
            }[]
                           },
"cleanup_abandoned_guests":
{ Args: { "p_older_than"?: string }; Returns: number
                           },
"create_trip":
{ Args: { "p_base_currency": string,"p_display_name": string,"p_end_date"?: string,"p_name": string,"p_people"?: (string)[],"p_start_date"?: string }; Returns: string
                           },
"current_link_kind":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["link_kind"]
                           },
"is_trip_admin":
{ Args: { "p_trip": string }; Returns: boolean
                           },
"is_trip_member":
{ Args: { "p_trip": string }; Returns: boolean
                           },
"issue_seat_invite":
{ Args: { "p_seat": string,"p_token_hash": string }; Returns: undefined
                           },
"request_seat_claim":
{ Args: { "p_seat": string }; Returns: undefined
                           },
"save_expense":
{ Args: { "p_expected_version": number,"p_expense": Json }; Returns: undefined
                           },
"save_trip":
{ Args: { "p_expected_version": number,"p_trip": Json }; Returns: number
                           },
"trip_unclaimed_first_names":
{ Args: { "p_trip": string }; Returns: {
              "first_name": string,"seat_id": string
            }[]
                           }
          }
          Enums: {
            "expense_status": "draft"|"complete"|"deleted","expense_type": "expense"|"money_received","link_kind": "none"|"guest"|"user","seat_role": "owner"|"admin"|"member","seat_status": "active"|"left","settle_mode": "simplified"|"hub"|"direct","settlement_status": "pending"|"confirmed"|"disputed"|"reversed","split_method": "equal"|"exact","trip_status": "active"|"settling"|"closed"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "expense_status": ["draft", "complete", "deleted"],"expense_type": ["expense", "money_received"],"link_kind": ["none", "guest", "user"],"seat_role": ["owner", "admin", "member"],"seat_status": ["active", "left"],"settle_mode": ["simplified", "hub", "direct"],"settlement_status": ["pending", "confirmed", "disputed", "reversed"],"split_method": ["equal", "exact"],"trip_status": ["active", "settling", "closed"]
          }
        }
} as const
