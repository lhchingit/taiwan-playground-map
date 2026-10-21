
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "admin_log": {
                  Row: {
                    "action": string,"actor": string,"after": Json | null,"before": Json | null,"created_at": string,"id": number,"target": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor": string,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: number,"target"?: string | null
                  }
                  Update: {
                    "action"?: string,"actor"?: string,"after"?: Json | null,"before"?: Json | null,"created_at"?: string,"id"?: number,"target"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"attribute_defs": {
                  Row: {
                    "category": string,"group_name": string | null,"key": string,"label": string,"sort_order": number
                  }
                  ComputedFields: never
                  Insert: {
                    "category": string,"group_name"?: string | null,"key": string,"label": string,"sort_order"?: number
                  }
                  Update: {
                    "category"?: string,"group_name"?: string | null,"key"?: string,"label"?: string,"sort_order"?: number
                  }
                  Relationships: [
                    
                  ]
                },"cities": {
                  Row: {
                    "bbox": (number)[] | null,"code": string,"launched_at": string | null,"name": string,"slug": string
                  }
                  ComputedFields: never
                  Insert: {
                    "bbox"?: (number)[] | null,"code": string,"launched_at"?: string | null,"name": string,"slug": string
                  }
                  Update: {
                    "bbox"?: (number)[] | null,"code"?: string,"launched_at"?: string | null,"name"?: string,"slug"?: string
                  }
                  Relationships: [
                    
                  ]
                },"edit_suggestions": {
                  Row: {
                    "applied_payload": Json | null,"created_at": string,"field": string | null,"id": number,"key": string | null,"kind": string,"note": string | null,"payload": NonNullable<Json>,"place_id": string | null,"proposed": string | null,"reject_reason": string | null,"review_note": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "applied_payload"?: Json | null,"created_at"?: string,"field"?: string | null,"id"?: number,"key"?: string | null,"kind"?: string,"note"?: string | null,"payload"?: NonNullable<Json>,"place_id"?: string | null,"proposed"?: string | null,"reject_reason"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "applied_payload"?: Json | null,"created_at"?: string,"field"?: string | null,"id"?: number,"key"?: string | null,"kind"?: string,"note"?: string | null,"payload"?: NonNullable<Json>,"place_id"?: string | null,"proposed"?: string | null,"reject_reason"?: string | null,"review_note"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "edit_suggestions_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "attribute_defs"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "edit_suggestions_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "place_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "edit_suggestions_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "edit_suggestions_user_fk"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"moderator_cities": {
                  Row: {
                    "city": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city": string,"user_id": string
                  }
                  Update: {
                    "city"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "moderator_cities_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "moderator_cities_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "city_bounds"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "moderator_cities_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"naming_candidates": {
                  Row: {
                    "city": string,"created_at": string,"district": string | null,"geom": unknown,"id": string,"nearby": NonNullable<Json>,"osm_ref": string,"resolved_at": string | null,"resolved_basis": string | null,"resolved_by": string | null,"resolved_name": string | null,"resolved_user": string | null,"resolved_votes": number | null,"status": string
                  }
                  ComputedFields: never
                  Insert: {
                    "city": string,"created_at"?: string,"district"?: string | null,"geom": unknown,"id": string,"nearby"?: NonNullable<Json>,"osm_ref": string,"resolved_at"?: string | null,"resolved_basis"?: string | null,"resolved_by"?: string | null,"resolved_name"?: string | null,"resolved_user"?: string | null,"resolved_votes"?: number | null,"status"?: string
                  }
                  Update: {
                    "city"?: string,"created_at"?: string,"district"?: string | null,"geom"?: unknown,"id"?: string,"nearby"?: NonNullable<Json>,"osm_ref"?: string,"resolved_at"?: string | null,"resolved_basis"?: string | null,"resolved_by"?: string | null,"resolved_name"?: string | null,"resolved_user"?: string | null,"resolved_votes"?: number | null,"status"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "naming_candidates_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "naming_candidates_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "city_bounds"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "naming_candidates_resolved_user_fkey"
      columns: ["resolved_user"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"naming_votes": {
                  Row: {
                    "action": string,"basis": string,"candidate_id": string,"created_at": string,"id": number,"name": string | null,"name_key": string | null,"updated_at": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"basis": string,"candidate_id": string,"created_at"?: string,"id"?: number,"name"?: string | null,"name_key"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Update: {
                    "action"?: string,"basis"?: string,"candidate_id"?: string,"created_at"?: string,"id"?: number,"name"?: string | null,"name_key"?: string | null,"updated_at"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "naming_votes_candidate_id_fkey"
      columns: ["candidate_id"]
isOneToOne: false
      referencedRelation: "naming_candidates"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "naming_votes_candidate_id_fkey"
      columns: ["candidate_id"]
isOneToOne: false
      referencedRelation: "naming_open"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "naming_votes_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"photos": {
                  Row: {
                    "caption": string | null,"created_at": string,"exif_stripped": boolean,"id": string,"place_id": string,"reject_reason": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"status": string,"storage_path": string,"user_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "caption"?: string | null,"created_at"?: string,"exif_stripped"?: boolean,"id"?: string,"place_id": string,"reject_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"storage_path": string,"user_id"?: string | null
                  }
                  Update: {
                    "caption"?: string | null,"created_at"?: string,"exif_stripped"?: boolean,"id"?: string,"place_id"?: string,"reject_reason"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"status"?: string,"storage_path"?: string,"user_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "photos_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "place_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "photos_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"place_attribute_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"id": number,"key": string,"new_note": string | null,"new_source": string | null,"new_value": string | null,"new_verified_at": string | null,"old_note": string | null,"old_source": string | null,"old_value": string | null,"old_verified_at": string | null,"place_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"id"?: number,"key": string,"new_note"?: string | null,"new_source"?: string | null,"new_value"?: string | null,"new_verified_at"?: string | null,"old_note"?: string | null,"old_source"?: string | null,"old_value"?: string | null,"old_verified_at"?: string | null,"place_id": string
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"id"?: number,"key"?: string,"new_note"?: string | null,"new_source"?: string | null,"new_value"?: string | null,"new_verified_at"?: string | null,"old_note"?: string | null,"old_source"?: string | null,"old_value"?: string | null,"old_verified_at"?: string | null,"place_id"?: string
                  }
                  Relationships: [
                    
                  ]
                },"place_attributes": {
                  Row: {
                    "key": string,"note": string | null,"place_id": string,"source_id": string | null,"value": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "key": string,"note"?: string | null,"place_id": string,"source_id"?: string | null,"value": string,"verified_at"?: string | null
                  }
                  Update: {
                    "key"?: string,"note"?: string | null,"place_id"?: string,"source_id"?: string | null,"value"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "place_attributes_key_fkey"
      columns: ["key"]
isOneToOne: false
      referencedRelation: "attribute_defs"
      referencedColumns: ["key"]
    },{
      foreignKeyName: "place_attributes_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "place_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "place_attributes_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "place_attributes_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"place_field_history": {
                  Row: {
                    "changed_at": string,"changed_by": string | null,"field": string,"id": number,"new_source": string | null,"new_until": string | null,"new_value": string | null,"new_verified_at": string | null,"note": string | null,"old_note": string | null,"old_source": string | null,"old_until": string | null,"old_value": string | null,"old_verified_at": string | null,"place_id": string,"restored_from": number | null,"suggestion_id": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "changed_at"?: string,"changed_by"?: string | null,"field": string,"id"?: number,"new_source"?: string | null,"new_until"?: string | null,"new_value"?: string | null,"new_verified_at"?: string | null,"note"?: string | null,"old_note"?: string | null,"old_source"?: string | null,"old_until"?: string | null,"old_value"?: string | null,"old_verified_at"?: string | null,"place_id": string,"restored_from"?: number | null,"suggestion_id"?: number | null
                  }
                  Update: {
                    "changed_at"?: string,"changed_by"?: string | null,"field"?: string,"id"?: number,"new_source"?: string | null,"new_until"?: string | null,"new_value"?: string | null,"new_verified_at"?: string | null,"note"?: string | null,"old_note"?: string | null,"old_source"?: string | null,"old_until"?: string | null,"old_value"?: string | null,"old_verified_at"?: string | null,"place_id"?: string,"restored_from"?: number | null,"suggestion_id"?: number | null
                  }
                  Relationships: [
                    
                  ]
                },"place_parking": {
                  Row: {
                    "distance_m": number | null,"fee": string,"fee_note": string | null,"id": number,"note": string | null,"place_id": string | null,"source_id": string | null,"spaces": number | null,"type": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "distance_m"?: number | null,"fee"?: string,"fee_note"?: string | null,"id"?: number,"note"?: string | null,"place_id"?: string | null,"source_id"?: string | null,"spaces"?: number | null,"type": string,"verified_at"?: string | null
                  }
                  Update: {
                    "distance_m"?: number | null,"fee"?: string,"fee_note"?: string | null,"id"?: number,"note"?: string | null,"place_id"?: string | null,"source_id"?: string | null,"spaces"?: number | null,"type"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "place_parking_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "place_cards"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "place_parking_place_id_fkey"
      columns: ["place_id"]
isOneToOne: false
      referencedRelation: "places"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "place_parking_source_id_fkey"
      columns: ["source_id"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"places": {
                  Row: {
                    "address": string | null,"age_max": number | null,"age_min": number | null,"area_ha": number | null,"attrs": NonNullable<Json>,"city": string,"coord_source": string | null,"created_at": string,"created_from_naming": boolean,"created_from_suggestion": number | null,"district": string | null,"fee": string | null,"geom": unknown,"hours": string | null,"hours_source": string | null,"hours_verified_at": string | null,"id": string,"indoor": boolean,"listing_source": string | null,"listing_verified_at": string | null,"name": string,"size_class": string | null,"status": string,"status_note": string | null,"status_source": string | null,"status_until": string | null,"status_verified_at": string | null,"stay_bucket": string | null,"stay_source": string | null,"summary": string | null,"surface": string | null,"surface_source": string | null,"surface_verified_at": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"age_max"?: number | null,"age_min"?: number | null,"area_ha"?: number | null,"attrs"?: NonNullable<Json>,"city": string,"coord_source"?: string | null,"created_at"?: string,"created_from_naming"?: boolean,"created_from_suggestion"?: number | null,"district"?: string | null,"fee"?: string | null,"geom": unknown,"hours"?: string | null,"hours_source"?: string | null,"hours_verified_at"?: string | null,"id": string,"indoor"?: boolean,"listing_source"?: string | null,"listing_verified_at"?: string | null,"name": string,"size_class"?: string | null,"status"?: string,"status_note"?: string | null,"status_source"?: string | null,"status_until"?: string | null,"status_verified_at"?: string | null,"stay_bucket"?: string | null,"stay_source"?: string | null,"summary"?: string | null,"surface"?: string | null,"surface_source"?: string | null,"surface_verified_at"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"age_max"?: number | null,"age_min"?: number | null,"area_ha"?: number | null,"attrs"?: NonNullable<Json>,"city"?: string,"coord_source"?: string | null,"created_at"?: string,"created_from_naming"?: boolean,"created_from_suggestion"?: number | null,"district"?: string | null,"fee"?: string | null,"geom"?: unknown,"hours"?: string | null,"hours_source"?: string | null,"hours_verified_at"?: string | null,"id"?: string,"indoor"?: boolean,"listing_source"?: string | null,"listing_verified_at"?: string | null,"name"?: string,"size_class"?: string | null,"status"?: string,"status_note"?: string | null,"status_source"?: string | null,"status_until"?: string | null,"status_verified_at"?: string | null,"stay_bucket"?: string | null,"stay_source"?: string | null,"summary"?: string | null,"surface"?: string | null,"surface_source"?: string | null,"surface_verified_at"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "places_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "places_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "city_bounds"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "places_hours_source_fkey"
      columns: ["hours_source"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "places_listing_source_fkey"
      columns: ["listing_source"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "places_status_source_fkey"
      columns: ["status_source"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "places_surface_source_fkey"
      columns: ["surface_source"]
isOneToOne: false
      referencedRelation: "sources"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "accepted_count": number,"ban_reason": string | null,"banned_at": string | null,"created_at": string,"display_name": string | null,"id": string,"role": string,"terms_accepted_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "accepted_count"?: number,"ban_reason"?: string | null,"banned_at"?: string | null,"created_at"?: string,"display_name"?: string | null,"id": string,"role"?: string,"terms_accepted_at"?: string | null
                  }
                  Update: {
                    "accepted_count"?: number,"ban_reason"?: string | null,"banned_at"?: string | null,"created_at"?: string,"display_name"?: string | null,"id"?: string,"role"?: string,"terms_accepted_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"saved_filters": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"query": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"query": string,"user_id"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"query"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "saved_filters_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"site_settings": {
                  Row: {
                    "id": boolean,"naming_threshold": number,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id"?: boolean,"naming_threshold"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "id"?: boolean,"naming_threshold"?: number,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "site_settings_updated_by_fkey"
      columns: ["updated_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"sources": {
                  Row: {
                    "id": string,"kind": string,"label": string,"url": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "id": string,"kind": string,"label": string,"url"?: string | null
                  }
                  Update: {
                    "id"?: string,"kind"?: string,"label"?: string,"url"?: string | null
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            "city_bounds": {
                  Row: {
                    "bbox": (number)[] | null,"code": string | null,"launched": boolean | null,"name": string | null,"slug": string | null
                  }
                  ComputedFields: never
                  Insert: {
                           "bbox"?: (number)[] | null,"code"?: string | null,"launched"?: never,"name"?: string | null,"slug"?: string | null
                         }
                        Update: {
                           "bbox"?: (number)[] | null,"code"?: string | null,"launched"?: never,"name"?: string | null,"slug"?: string | null
                         }
                        Relationships: [
                    
                  ]
                },"naming_open": {
                  Row: {
                    "city": string | null,"district": string | null,"id": string | null,"lat": number | null,"lng": number | null,"nearby": Json | null,"osm_ref": string | null,"votes": number | null
                  }
                  ComputedFields: never
                  Insert: {
                           "city"?: string | null,"district"?: string | null,"id"?: string | null,"lat"?: never,"lng"?: never,"nearby"?: Json | null,"osm_ref"?: string | null,"votes"?: never
                         }
                        Update: {
                           "city"?: string | null,"district"?: string | null,"id"?: string | null,"lat"?: never,"lng"?: never,"nearby"?: Json | null,"osm_ref"?: string | null,"votes"?: never
                         }
                        Relationships: [
                    {
      foreignKeyName: "naming_candidates_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "naming_candidates_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "city_bounds"
      referencedColumns: ["code"]
    }
                  ]
                },"place_cards": {
                  Row: {
                    "age_max": number | null,"age_min": number | null,"attrs": Json | null,"city": string | null,"district": string | null,"fee": string | null,"id": string | null,"indoor": boolean | null,"lat": number | null,"lng": number | null,"name": string | null,"parking": Json | null,"size": string | null,"status": string | null,"stay": string | null
                  }
                  ComputedFields: never
                  Relationships: [
                    {
      foreignKeyName: "places_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "cities"
      referencedColumns: ["code"]
    },{
      foreignKeyName: "places_city_fkey"
      columns: ["city"]
isOneToOne: false
      referencedRelation: "city_bounds"
      referencedColumns: ["code"]
    }
                  ]
                }
          }
          Functions: {
            "admin_ban":
{ Args: { "p_reason": string,"p_user": string }; Returns: undefined
                           },
"admin_list_users":
{ Args: { "p_limit"?: number,"p_offset"?: number,"p_query"?: string }; Returns: {
              "accepted_count": number,"ban_reason": string,"banned_at": string,"cities": (string)[],"created_at": string,"display_name": string,"email": string,"id": string,"role": string,"suggestions": number,"total": number
            }[]
                           },
"admin_set_cities":
{ Args: { "p_cities": (string)[],"p_user": string }; Returns: undefined
                           },
"admin_set_naming_threshold":
{ Args: { "p_threshold": number }; Returns: undefined
                           },
"admin_set_role":
{ Args: { "p_role": string,"p_user": string }; Returns: undefined
                           },
"admin_unban":
{ Args: { "p_user": string }; Returns: undefined
                           },
"app_role":
{ Args: Record<PropertyKey, never>; Returns: string
                           },
"apply_naming":
{ Args: { "p_action": string,"p_basis": string,"p_by": string,"p_candidate": string,"p_name": string,"p_user": string,"p_votes"?: number }; Returns: undefined
                           },
"can_moderate":
{ Args: { "p_city": string }; Returns: boolean
                           },
"check_naming":
{ Args: { "p_action": string,"p_basis": string,"p_name": string }; Returns: undefined
                           },
"check_suggestion_payload":
{ Args: { "p": Json,"p_kind": string,"p_place_id": string }; Returns: undefined
                           },
"city_launched":
{ Args: { "p_city": string }; Returns: boolean
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"has_accepted_terms":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"is_admin":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"log_field_change":
{ Args: { "p_comment"?: string,"p_field": string,"p_new": Omit<Database["public"]['Tables']["places"]['Row'], Database["public"]['Tables']["places"]['ComputedFields']>,"p_old": Omit<Database["public"]['Tables']["places"]['Row'], Database["public"]['Tables']["places"]['ComputedFields']>,"p_place_id": string,"p_restored_from"?: number,"p_suggestion_id"?: number }; Returns: undefined
                           },
"naming_candidate_city":
{ Args: { "p_candidate": string }; Returns: string
                           },
"naming_key":
{ Args: { "p_name": string }; Returns: string
                           },
"naming_threshold":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"naming_vote_count":
{ Args: { "p_candidate": string }; Returns: number
                           },
"naming_voted":
{ Args: { "p_candidate": string }; Returns: boolean
                           },
"place_city":
{ Args: { "p_place_id": string }; Returns: string
                           },
"reopen_place":
{ Args: { "p_note"?: string,"p_place_id": string }; Returns: undefined
                           },
"require_admin_on":
{ Args: { "p_user": string }; Returns: {
              "accepted_count": number,
"ban_reason": string | null,
"banned_at": string | null,
"created_at": string,
"display_name": string | null,
"id": string,
"role": string,
"terms_accepted_at": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "profiles"
        isOneToOne: true
        isSetofReturn: false
      } },
"resolve_naming":
{ Args: { "p_action": string,"p_basis": string,"p_candidate": string,"p_name": string }; Returns: undefined
                           },
"restore_attribute":
{ Args: { "p_history_id": number }; Returns: undefined
                           },
"restore_field":
{ Args: { "p_history_id": number }; Returns: undefined
                           },
"review_suggestion":
{ Args: { "p_accept": boolean,"p_id": number,"p_note"?: string,"p_payload"?: Json,"p_reason"?: string }; Returns: undefined
                           },
"vote_naming":
{ Args: { "p_action": string,"p_basis": string,"p_candidate": string,"p_name": string }; Returns: string
                           },
"withdraw_suggestion":
{ Args: { "p_id": number }; Returns: undefined
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
  "public": {
          Enums: {
            
          }
        }
} as const
