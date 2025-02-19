import { analyzeFunctionCalls } from "./index.js";

console.log(analyzeFunctionCalls(`


function foo(a, b) {
    var c = 100
    if(c > a){
        if( a > 200){
            alert(1)
            alert(4)
        }else if(a > 100){
            alert(2)
            if(b > 200){
                alert(5)
            }else{
                alert(6)
            }
            alert(7)
        }else{
            alert(3)

            if(b > 200){
                alert(8)
            }else{
                alert(9)
            }
            alert(10)
        }    
    }
}




`, "DV",["alert"]));