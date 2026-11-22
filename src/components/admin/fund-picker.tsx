"use client";
import {createContext,useContext,useEffect,useId,useMemo,useRef,useState} from 'react';
import {Check,ChevronDown,Search} from 'lucide-react';
import {fundPickerOptions,fundPickerAmounts,fundPickerStatus,type FundPickerOption} from '@/lib/fund-picker-options';
import {vnd} from '@/lib/domain';
import {accountLabel} from '@/lib/account-label';

const Metadata=createContext(new Map<string,FundPickerOption>());
export function FundPickerProvider({funds,children}:{funds:FundPickerOption[];children:React.ReactNode}){
 const metadata=useMemo(()=>new Map(funds.map(fund=>[fund.id,fund])),[funds]);
 return <Metadata.Provider value={metadata}>{children}</Metadata.Provider>;
}
function Summary({fund,accounts}:{fund:FundPickerOption;accounts:{id:string;number:string}[]}){
 const amounts=fundPickerAmounts(fund);
 const ids=[...new Set([fund.accountId,...(fund.accountIds??[])].filter(Boolean))];
 return <span className="fund-picker-summary">
  <span className="fund-picker-heading"><strong>{fund.code}</strong><span className={`fund-picker-status status-${fund.status??'unknown'}`}>{fundPickerStatus(fund.status)}</span></span>
  <span className="fund-picker-name">{fund.name}</span>
  <span className="fund-picker-amounts"><span>Tổng thu: <b>{amounts.income===undefined?'—':vnd(amounts.income)}</b></span><span className={amounts.excess&&amounts.excess>0n?'has-deficit':''}>Chi vượt quỹ: <b>{amounts.excess===undefined?'—':vnd(amounts.excess)}</b></span></span>
  {!!accounts.length&&<span className="fund-picker-accounts">{ids.map(id=>accounts.find(account=>account.id===id)).filter(Boolean).map(account=>accountLabel(account!.number)).join(' · ')}</span>}
 </span>;
}
export function FundPicker({funds,accounts=[],value,defaultValue='',onChange,name,placeholder='Chọn thiện pháp',required=false,disabled=false,disabledIds=[],label='Chọn thiện pháp'}:{
 funds:FundPickerOption[];accounts?:{id:string;number:string}[];value?:string;defaultValue?:string;onChange?:(id:string)=>void;name?:string;placeholder?:string;required?:boolean;disabled?:boolean;disabledIds?:string[];label?:string;
}){
 const metadata=useContext(Metadata),[internal,setInternal]=useState(defaultValue),[open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(0),[invalid,setInvalid]=useState(false);
 const selectedId=value??internal,options=useMemo(()=>fundPickerOptions(funds,metadata),[funds,metadata]);
 const visible=useMemo(()=>fundPickerOptions(funds,metadata,query),[funds,metadata,query]);
 const selected=options.find(fund=>fund.id===selectedId),id=useId(),trigger=useRef<HTMLButtonElement>(null),panel=useRef<HTMLDivElement>(null),search=useRef<HTMLInputElement>(null),proxy=useRef<HTMLInputElement>(null);
 function position(){
  if(!trigger.current||!panel.current)return;
  const rect=trigger.current.getBoundingClientRect(),viewport=window.visualViewport;
  const bottom=(viewport?.height??window.innerHeight)+(viewport?.offsetTop??0),top=viewport?.offsetTop??0;
  const width=Math.min(Math.max(rect.width,360),window.innerWidth-24),height=Math.min(panel.current.scrollHeight||360,360,bottom-top-24);
  Object.assign(panel.current.style,{width:`${width}px`,left:`${Math.max(12,Math.min(rect.left,window.innerWidth-width-12))}px`,top:`${Math.max(top+12,bottom-rect.bottom>=height+8?rect.bottom+6:rect.top-height-6)}px`,maxHeight:`${Math.max(80,Math.min(360,bottom-top-24))}px`});
 }
 function close(){panel.current?.hidePopover();setOpen(false);}
 function show(initialQuery=''){
  setQuery(initialQuery);setActive(0);setOpen(true);position();panel.current?.showPopover();
  requestAnimationFrame(()=>{position();search.current?.focus();});
 }
 function choose(id:string){
  if(disabledIds.includes(id))return;
  setInternal(id);setInvalid(false);onChange?.(id);close();trigger.current?.focus();
 }
 useEffect(()=>{
  if(!open)return;
  const update=()=>position();window.addEventListener('resize',update);window.addEventListener('scroll',update,true);window.visualViewport?.addEventListener('resize',update);
  return()=>{window.removeEventListener('resize',update);window.removeEventListener('scroll',update,true);window.visualViewport?.removeEventListener('resize',update);};
 },[open]);
 useEffect(()=>{
  if(!open)return;
  const option=panel.current?.querySelector<HTMLElement>(`[data-index="${active}"]`),list=panel.current?.querySelector<HTMLElement>('.fund-picker-list');
  if(!option||!list)return;
  const itemRect=option.getBoundingClientRect(),listRect=list.getBoundingClientRect();
  if(itemRect.top<listRect.top)list.scrollTop-=listRect.top-itemRect.top;
  else if(itemRect.bottom>listRect.bottom)list.scrollTop+=itemRect.bottom-listRect.bottom;
 },[active,open]);
 useEffect(()=>{
  const form=proxy.current?.form;if(!form)return;
  const reset=()=>{setInternal(defaultValue);setInvalid(false);};form.addEventListener('reset',reset);return()=>form.removeEventListener('reset',reset);
 },[defaultValue]);
 return <span className={`fund-picker${invalid?' is-invalid':''}`}>
  <input ref={proxy} className="fund-picker-validation" aria-hidden="true" tabIndex={-1} autoComplete="off" name={name} value={selected?.id??''} required={required} disabled={disabled} onChange={()=>{}} onInvalid={event=>{event.preventDefault();setInvalid(true);show();}}/>
  <button ref={trigger} type="button" className="fund-picker-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}-list`} aria-describedby={invalid?`${id}-error`:undefined} disabled={disabled} onClick={()=>open?close():show()} onKeyDown={event=>{
   if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();show();}
   else if(event.key.length===1&&!event.ctrlKey&&!event.metaKey&&event.key!==' '){event.preventDefault();show(event.key);}
  }}>{selected?<Summary fund={selected} accounts={[]}/>:<span className="fund-picker-placeholder">{placeholder}</span>}<ChevronDown size={17} aria-hidden="true"/></button>
  {invalid&&<span id={`${id}-error`} className="field-error" role="alert">Vui lòng chọn thiện pháp.</span>}
  <div ref={panel} id={`${id}-popup`} popover="auto" className="fund-picker-popover" onToggle={event=>setOpen(event.newState==='open')} onKeyDown={event=>{
   if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();trigger.current?.focus();}
  }}>
   {open&&<><div className="fund-picker-search"><Search size={17} aria-hidden="true"/><input ref={search} type="search" role="combobox" aria-label={`Tìm ${label.toLowerCase()}`} aria-autocomplete="list" aria-expanded="true" aria-controls={`${id}-list`} aria-activedescendant={visible[active]?`${id}-option-${active}`:undefined} placeholder="Tìm mã hoặc tên thiện pháp…" value={query} onChange={event=>{setQuery(event.target.value);setActive(0);}} onKeyDown={event=>{
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
     event.preventDefault();setActive(current=>Math.max(0,Math.min(visible.length-1,current+(event.key==='ArrowDown'?1:-1))));
    }else if(event.key==='Enter'){event.preventDefault();if(visible[active])choose(visible[active].id);}
   }}/></div>
   <div id={`${id}-list`} role="listbox" aria-label={label} className="fund-picker-list">
    {!required&&<button type="button" role="option" aria-selected={!selected} onClick={()=>choose('')} className="fund-picker-clear">{placeholder}</button>}
    {visible.map((fund,index)=><button key={fund.id} id={`${id}-option-${index}`} type="button" role="option" aria-selected={selectedId===fund.id} disabled={disabledIds.includes(fund.id)} tabIndex={-1} data-index={index} className={`fund-picker-option${index===active?' is-active':''}`} onPointerMove={()=>setActive(index)} onClick={()=>choose(fund.id)}><Summary fund={fund} accounts={accounts}/>{selectedId===fund.id&&<Check size={17} aria-hidden="true"/>}</button>)}
    {!visible.length&&<p className="fund-picker-empty">Không tìm thấy thiện pháp phù hợp.</p>}
   </div><span className="fund-picker-footer">{visible.length} thiện pháp · Tạo trước hiển thị trước</span></>}
  </div>
 </span>;
}
