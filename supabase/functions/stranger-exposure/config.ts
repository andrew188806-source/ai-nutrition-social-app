import {decodeSocialCandidateRefKey} from '../_shared/social-candidate-ref/index.ts';
import type {StrangerConfig} from '../_shared/stranger-exposure/service.ts';
export function loadConfig():StrangerConfig|null{try{
 const get=(name:string)=>{const v=Deno.env.get(name)?.trim();if(!v)throw Error('missing_config');return v;};
 return {supabaseUrl:get('SUPABASE_URL'),supabaseAnonKey:get('SUPABASE_ANON_KEY'),strangerKey:decodeSocialCandidateRefKey(get('STRANGER_EXPOSURE_REF_KEY_V1')),cardKey:decodeSocialCandidateRefKey(get('MEAL_BUDDY_CARD_REF_KEY_V1')),relationshipKey:decodeSocialCandidateRefKey(get('MEAL_BUDDY_RELATIONSHIP_REF_KEY_V1'))};
}catch{return null;}}
