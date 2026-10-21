import type {SocialCandidateRefCipher} from './social-candidate-ref/types.ts';
export const codeActor=(actor:string)=>'friend-code-search-v1|'+actor;
export const sealCodeSearchCandidateRef=(cipher:SocialCandidateRefCipher,actor:string,target:string,now:Date)=>cipher.seal(codeActor(actor),target,now);
