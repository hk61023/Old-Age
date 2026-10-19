import { Component,type ReactNode } from 'react';
export class IncomeBoundary extends Component<{children:ReactNode},{failed:boolean}>{
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  render(){return this.state.failed?<section className="card" role="alert"><h1>收入参照暂时无法打开</h1><p>请刷新页面重新加载。养老金测算仍可从上方导航进入。</p><button onClick={()=>window.location.reload()}>刷新页面</button></section>:this.props.children;}
}
