package cn.nemo.qingxiao;
import org.json.*;import java.util.*;
/** Derived, cycle-safe hierarchy; never rewrites synchronized parent links. */
public final class TaskTree {
 final Map<String,JSONObject> nodes=new LinkedHashMap<>();final Map<String,String> parents=new HashMap<>();final Map<String,List<String>> children=new HashMap<>();
 TaskTree(JSONArray items)throws Exception{for(int i=0;i<items.length();i++){JSONObject t=items.getJSONObject(i);nodes.put(t.getString("id"),t);}for(String id:nodes.keySet()){String p=nodes.get(id).optString("parentId");parents.put(id,nodes.containsKey(p)&&!p.equals(id)?p:"");children.put(id,new ArrayList<>());}Set<String> visited=new HashSet<>();for(String id:nodes.keySet()){LinkedHashSet<String> path=new LinkedHashSet<>();String p=id;while(!p.isEmpty()&&!visited.contains(p)){if(!path.add(p)){List<String> cycle=new ArrayList<>();boolean inside=false;for(String v:path){if(v.equals(p))inside=true;if(inside)cycle.add(v);}parents.put(Collections.min(cycle),"");break;}p=parents.get(p);}visited.addAll(path);}for(String id:nodes.keySet()){String p=parents.get(id);if(!p.isEmpty())children.get(p).add(id);}}
 boolean root(String id){return parents.getOrDefault(id,"").isEmpty();}
 boolean hidden(String id,boolean completed){String p=id;while(p!=null&&!p.isEmpty()){JSONObject t=nodes.get(p);if(t==null)return false;if(t.optBoolean("deleted")||t.optBoolean("purged")||(completed&&t.optBoolean("done")))return true;p=parents.get(p);}return false;}
 String path(String id){List<String> result=new ArrayList<>();String p=parents.get(id);while(p!=null&&!p.isEmpty()){result.add(nodes.get(p).optString("title"));p=parents.get(p);}Collections.reverse(result);return String.join(" / ",result);}
 String progress(String id){int total=0,done=0;Deque<String> pending=new ArrayDeque<>(children.getOrDefault(id,Collections.emptyList()));while(!pending.isEmpty()){String n=pending.removeFirst();if(hidden(n,false))continue;List<String> live=new ArrayList<>();for(String child:children.get(n))if(!hidden(child,false))live.add(child);if(live.isEmpty()){total++;if(hidden(n,true))done++;}else pending.addAll(live);}return total==0?"":done+"/"+total;}
}
