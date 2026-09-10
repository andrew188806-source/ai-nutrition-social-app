import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import {createRestaurantSocialLinksComposition} from "./composition";
import type {RestaurantSocialLinksUiState} from "./types";
export function useRestaurantSocialLinks(restaurantId:string|null|undefined){
  const repository=useMemo(()=>createRestaurantSocialLinksComposition(),[]);
  const generation=useRef(0);
  const [state,setState]=useState<RestaurantSocialLinksUiState>({status:"idle",links:[]});
  const load=useCallback(async()=>{const request=++generation.current;if(!restaurantId){setState({status:"idle",links:[]});return}
    setState({status:"loading",links:[]});const result=await repository.load(restaurantId);if(request!==generation.current)return;
    if(result.status==="available")setState({status:"success",links:result.links});
    else if(result.status==="empty")setState({status:"empty",links:[]});
    else setState({status:result.status,links:[],message:result.message});
  },[repository,restaurantId]);
  useEffect(()=>{void load();return()=>{generation.current+=1}},[load]);
  return{state,refresh:load};
}
